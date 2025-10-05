import { revalidatePath } from "next/cache";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import { updateLectureContent } from "@/services/lecture/persist";
import { getLectureById } from "@/data/lecture/repository";
import { assembleTimeline } from "@/lib/timeline/timeline-assembler";

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

      // Assemble timeline using pure function
      const timeline = assembleTimeline({
        images,
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