import { revalidatePath } from "next/cache";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import { updateLectureContent, type LectureUpdatePayload } from "@/services/lecture/persist";
import { getLectureById } from "@/data/lecture/repository";
import { assembleTimeline } from "@/lib/timeline/timeline-assembler";

type LoadedLecture = NonNullable<Awaited<ReturnType<typeof getLectureById>>>;

const inngest = getInngestApp();

const TIMELINE_GENERATION_WORKFLOW_STEP = 7;

export type GenerateTimelineEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  workflowStep?: number;
  totalWorkflowSteps?: number;
};

export const generateTimeline = inngest.createFunction(
  { id: "generate-timeline" },
  { event: "app/generate-timeline" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId: _projectId,
      workflowStep = TIMELINE_GENERATION_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
    } = event.data as GenerateTimelineEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    // Check if we should skip this step (resume mode)
    await publishStatus("Building timeline", workflowStep);

    const lecture = await step.run("load-lecture-assets", async () => {
      const lecture = await getLectureById({ lectureId });
      if (!lecture) {
        throw new Error(`Lecture ${lectureId} not found`);
      }

      log.info("Loaded lecture assets", {
        images: lecture.images?.length ?? 0,
        videos: lecture.videos?.length ?? 0,
        narration: lecture.narration?.length ?? 0,
        music: lecture.music?.length ?? 0,
      });
      return lecture as LoadedLecture;
    });

    const assetBasePath = `${userId}/${lecture.projectId}`;

    const preparedLecture = (await step.run("normalize-asset-paths", async () => {
      const normalizePath = (path?: string | null) => {
        if (!path) return path;
        const trimmed = path.replace(/^\/+/, "");
        if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
          return trimmed;
        }
        if (trimmed.startsWith(assetBasePath)) {
          return trimmed;
        }
        return `${assetBasePath}/${trimmed}`;
      };

      const payload: LectureUpdatePayload = {};

      if (lecture.images && lecture.images.length > 0) {
        const normalisedImages = lecture.images.map((image) => {
          const nextSource = normalizePath(image.sourceUrl);
          return nextSource && nextSource !== image.sourceUrl
            ? { ...image, sourceUrl: nextSource }
            : image;
        });

        if (normalisedImages.some((img, idx) => img !== lecture.images![idx])) {
          payload.images = normalisedImages;
        }
      }

      if (lecture.narration && lecture.narration.length > 0) {
        const normalisedNarration = lecture.narration.map((item) => {
          const nextSource = normalizePath(item.sourceUrl);
          return nextSource && nextSource !== item.sourceUrl
            ? { ...item, sourceUrl: nextSource }
            : item;
        });

        if (normalisedNarration.some((n, idx) => n !== lecture.narration![idx])) {
          payload.narration = normalisedNarration;
        }
      }

      if (lecture.music && lecture.music.length > 0) {
        const normalisedMusic = lecture.music.map((item) => {
          const nextAudio = normalizePath(item.audioUrl);
          return nextAudio && nextAudio !== item.audioUrl
            ? { ...item, audioUrl: nextAudio }
            : item;
        });

        if (normalisedMusic.some((m, idx) => m !== lecture.music![idx])) {
          payload.music = normalisedMusic;
        }
      }

      if (lecture.videos && lecture.videos.length > 0) {
        const normalisedVideos = lecture.videos.map((item) => {
          const nextStartingImage = normalizePath(item.startingImageUrl);
          return nextStartingImage && nextStartingImage !== item.startingImageUrl
            ? { ...item, startingImageUrl: nextStartingImage }
            : item;
        });

        if (normalisedVideos.some((v, idx) => v !== lecture.videos![idx])) {
          payload.videos = normalisedVideos;
        }
      }

      if (Object.keys(payload).length === 0) {
        return lecture;
      }

      const updated = await updateLectureContent({
        lectureId,
        actorId: userId,
        baseRevision: lecture.revision,
        payload,
      });

      log.info("Asset paths normalised", payload);

      return updated;
    })) as LoadedLecture;

    const timeline = await step.run("assemble-timeline", async () => {
      const images = preparedLecture.images ?? [];
      const videos = preparedLecture.videos ?? [];
      const narration = preparedLecture.narration ?? [];
      const music = preparedLecture.music ?? [];

      // Assemble timeline using pure function
      const timeline = assembleTimeline({
        images,
        videos,
        narration,
        music,
        runId,
      });

      log.info("Timeline assembled", {
        visualClips: timeline.tracks.visual.length,
        voiceClips: timeline.tracks.voice.length,
        musicClips: timeline.tracks.music.length,
        duration: timeline.duration,
      });

      return timeline;
    });

    const savedSnapshot = await step.run("save-timeline", async () => {
      const snapshot = await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { timeline },
      });

      const savedTimeline = snapshot.timeline;

      if (!savedTimeline) {
        log.error("Timeline missing after save", { lectureId, runId });
        throw new Error("Timeline not persisted");
      }

      log.info("Timeline saved to database", {
        timelineId: savedTimeline.id,
        visualClips: savedTimeline.tracks.visual.length,
        voiceClips: savedTimeline.tracks.voice.length,
        musicClips: savedTimeline.tracks.music.length,
        duration: savedTimeline.duration,
        lectureUpdatedAt: snapshot.updatedAt.toISOString(),
      });

      return snapshot;
    });

    await step.run("verify-timeline", async () => {
      const latestLecture = await getLectureById({ lectureId });
      const timelineTracks = latestLecture?.timeline?.tracks;

      log.info("Timeline verification", {
        visualClips: timelineTracks?.visual.length ?? 0,
        voiceClips: timelineTracks?.voice.length ?? 0,
        musicClips: timelineTracks?.music.length ?? 0,
        duration: latestLecture?.timeline?.duration ?? 0,
        lectureUpdatedAt: latestLecture?.updatedAt.toISOString(),
      });
    });

    await step.run("revalidate-paths", async () => {
      revalidatePath("/edit");
      revalidatePath(`/edit/${lectureId}`);
      log.info("Paths revalidated");
    });

    await publishStatus("Timeline created successfully", workflowStep, "complete");

    await step.run("notify-timeline-complete", async () => {
      const { lectureProgressChannel } = await import("@/inngest/functions/workflow-utils");
      await publish(
        lectureProgressChannel(userId).progress({
          type: "timeline-complete",
          runId,
          lectureId,
          timestamp: new Date().toISOString(),
        })
      );
      log.info("Timeline completion notification sent");
    });

    log.info("Timeline generation complete");

    if (!savedSnapshot.timeline) {
      throw new Error("Timeline not found after persistence");
    }

    return { runId, timeline: savedSnapshot.timeline };
  }
);
