import { revalidatePath } from "next/cache";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type {
  Timeline,
  KenBurnsClip,
  VoiceClip,
  MusicClip,
  TimelineTracks,
} from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getLectureById } from "@/data/lecture/repository";

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
      projectId,
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

    await publishStatus("Building timeline", workflowStep);

    const lecture = await step.run("load-lecture-assets", async () => {
      const lecture = await getLectureById({ lectureId });
      if (!lecture) {
        throw new Error(`Lecture ${lectureId} not found`);
      }

      log.info("Loaded lecture assets", {
        images: lecture.images?.length ?? 0,
        narration: lecture.narration?.length ?? 0,
        music: lecture.music?.length ?? 0,
      });

      return lecture;
    });

    const timeline = await step.run("assemble-timeline", async () => {
      const images = lecture.images ?? [];
      const narration = lecture.narration ?? [];
      const music = lecture.music ?? [];

      if (images.length === 0) {
        throw new Error("No images available for timeline");
      }

      if (narration.length === 0) {
        throw new Error("No narration available for timeline");
      }

      // Calculate total duration from narration
      const totalDuration = narration.reduce(
        (sum, n) => sum + (n.duration ?? 0),
        0
      );

      log.info("Timeline duration calculated", { totalDuration });

      // Build visual track with Ken Burns effects
      let accumulatedTime = 0;
      const visualTrack: KenBurnsClip[] = images.map((image, index) => {
        const narrationDuration = narration[index]?.duration ?? 0;
        const clip: KenBurnsClip = {
          id: `visual-${index}`,
          name: `Segment ${index + 1}`,
          kind: "kenBurns",
          imageAssetId: image.id,
          imageUrl: `/api/storage/${image.sourceUrl}`,
          startTime: accumulatedTime,
          duration: narrationDuration,
          startScale: 1.0,
          endScale: 1.2,
          startX: 0,
          startY: 0,
          endX: 0,
          endY: 0,
        };
        accumulatedTime += narrationDuration;
        return clip;
      });

      // Build voice track
      accumulatedTime = 0;
      const voiceTrack: VoiceClip[] = narration.map((narrationAsset, index) => {
        const clip: VoiceClip = {
          id: `voice-${index}`,
          name: `Narration ${index + 1}`,
          kind: "voice",
          narrationAssetId: narrationAsset.id,
          audioUrl: `/api/storage/${narrationAsset.sourceUrl}`,
          startTime: accumulatedTime,
          duration: narrationAsset.duration ?? 0,
          volume: 1.0,
        };
        accumulatedTime += narrationAsset.duration ?? 0;
        return clip;
      });

      // Build music track
      const musicTrack: MusicClip[] = music.map((musicAsset) => ({
        id: `music-${runId}`,
        name: "Background Score",
        kind: "music",
        musicAssetId: musicAsset.id,
        audioUrl: `/api/storage/${musicAsset.audioUrl}`,
        startTime: 0,
        duration: totalDuration,
        volume: 0.3,
        fadeInDuration: 2,
        fadeOutDuration: 3,
      }));

      const tracks: TimelineTracks = {
        visual: visualTrack,
        voice: voiceTrack,
        music: musicTrack,
        soundEffects: [],
      };

      const timeline: Timeline = {
        id: `timeline-${runId}`,
        name: "Timeline",
        duration: totalDuration,
        tracks,
      };

      log.info("Timeline assembled", {
        visualClips: visualTrack.length,
        voiceClips: voiceTrack.length,
        musicClips: musicTrack.length,
        duration: totalDuration,
      });

      return timeline;
    });

    await step.run("save-timeline", async () => {
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { timeline },
      });

      log.info("Timeline saved to database");
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

    return { runId, timeline };
  }
);