import { getInngestApp } from "@/inngest/client";
import { createLectureLogger, createLectureProgressPublisher, LECTURE_WORKFLOW_TOTAL_STEPS } from "@/inngest/functions/workflow-utils";
import { confirmConfiguration } from "@/inngest/functions/confirm-configuration";
import { createLectureScript } from "@/inngest/functions/create-lecture-script";
import { generateSegmentImages } from "@/inngest/functions/generate-segment-images";
import { generateNarration } from "@/inngest/functions/generate-narration";
import { generateMusic } from "@/inngest/functions/generate-music";
import { generateTimeline } from "@/inngest/functions/generate-timeline";
import type { ImageGenerationDefaults, NarrationGenerationDefaults, NarrationSettings } from "@/types/types";
import { DEFAULT_NARRATION_GENERATION_DEFAULTS, DEFAULT_LECTURE_CONFIG } from "@/types/types";
import { getLectureById } from "@/data/lecture/repository";

export type LectureCreationEventData = {
  prompt: string;
  userId: string;
  runId: string;
  lectureId: number;
  imageDefaults: ImageGenerationDefaults;
  narrationDefaults?: NarrationGenerationDefaults;
  totalWorkflowSteps?: number;
};

const inngest = getInngestApp();

export const startLectureCreation = inngest.createFunction(
  { id: "start-lecture-creation" },
  { event: "app/start-lecture-creation" },
  async ({ event, logger, step, publish }) => {
    const { userId, prompt, runId, lectureId, narrationDefaults } =
      event.data as LectureCreationEventData;
    const log = createLectureLogger(runId, logger);

    log.info("Starting lecture workflow");

    // Send immediate progress update
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      log,
    });
    await publishStatus("Starting lecture creation", 0);

    // Get existing lecture config before confirmation
    const existingLecture = await step.run("get-existing-config", async () => {
      return await getLectureById({ lectureId });
    });

    // Step 0: Confirm configuration with user, preserving existing config as base
    const { config } = await step.invoke("confirm-configuration", {
      function: confirmConfiguration,
      data: {
        userId,
        prompt,
        runId,
        lectureId,
        defaultConfig: existingLecture?.config ?? DEFAULT_LECTURE_CONFIG,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      },
    });

    log.info("Configuration confirmed", { config });

    const { script } = await step.invoke("create-lecture-script", {
      function: createLectureScript,
      data: {
        userId,
        prompt,
        runId,
        lectureId,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      },
    });

    const lecture = await step.run("get-lecture-for-images", async () => {
      return await getLectureById({ lectureId });
    });

    if (!lecture) {
      throw new Error(`Lecture ${lectureId} not found`);
    }

    // Extract image settings from confirmed config
    const confirmedImageSettings: ImageGenerationDefaults = {
      width: 1024,
      height: 576,
      aspectRatio: config.image.aspectRatio,
      size: config.image.size,
      style: config.image.style,
      imagesPerSegment: config.image.imagesPerSegment,
    };

    const generatedImages = await step.invoke("generate-segment-images", {
      function: generateSegmentImages,
      data: {
        userId,
        runId,
        lectureId,
        projectId: lecture.projectId,
        script,
        imageDefaults: confirmedImageSettings,
        workflowStep: 3,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      },
    });

    const lectureAfterImages = await step.run("get-lecture-for-narration", async () => {
      return await getLectureById({ lectureId });
    });

    if (!lectureAfterImages) {
      throw new Error(`Lecture ${lectureId} not found`);
    }

    const narrationConfig = narrationDefaults ?? DEFAULT_NARRATION_GENERATION_DEFAULTS;

    const narrationSettings: NarrationSettings[] = script.segments.map((_, index) => ({
      id: `narration-${index}`,
      label: `Segment ${index + 1}`,
      model: narrationConfig.model,
      voice: narrationConfig.voice,
    }));

    const generatedNarration = await step.invoke("generate-narration", {
      function: generateNarration,
      data: {
        userId,
        runId,
        lectureId,
        projectId: lecture.projectId,
        script,
        narration: narrationSettings,
        workflowStep: 4,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      },
    });

    const lectureAfterNarration = await step.run("get-lecture-for-music", async () => {
      return await getLectureById({ lectureId });
    });

    if (!lectureAfterNarration) {
      throw new Error(`Lecture ${lectureId} not found after narration`);
    }

    // Calculate total duration from narration for music generation
    const totalDuration = (lectureAfterNarration.narration ?? []).reduce(
      (sum, n) => sum + (n.duration ?? 0),
      0
    );

    const generatedMusic = await step.invoke("generate-music", {
      function: generateMusic,
      data: {
        userId,
        runId,
        lectureId,
        projectId: lecture.projectId,
        script,
        durationSeconds: totalDuration,
        workflowStep: 5,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      },
    });

    const timeline = await step.invoke("generate-timeline", {
      function: generateTimeline,
      data: {
        userId,
        runId,
        lectureId,
        projectId: lecture.projectId,
        workflowStep: 6,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      },
    });

    log.info("Lecture workflow completed", {
      hasScript: Boolean(script),
      generatedImages: generatedImages?.images?.length ?? 0,
      generatedNarration: generatedNarration?.narration?.length ?? 0,
      hasMusic: Boolean(generatedMusic?.music),
      hasTimeline: Boolean(timeline?.timeline),
    });

    return { runId };
  }
);
