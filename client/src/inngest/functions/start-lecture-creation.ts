import { getInngestApp } from "@/inngest/client";
import { createLectureLogger, createLectureProgressPublisher, LECTURE_WORKFLOW_TOTAL_STEPS } from "@/inngest/functions/workflow-utils";
import { createLectureScript } from "@/inngest/functions/create-lecture-script";
import { generateSegmentImages } from "@/inngest/functions/generate-segment-images";
import { generateNarration } from "@/inngest/functions/generate-narration";
import { generateMusic } from "@/inngest/functions/generate-music";
import { generateTimeline } from "@/inngest/functions/generate-timeline";
import type { ImageGenerationDefaults, NarrationGenerationDefaults, NarrationSettings } from "@/types/types";
import { DEFAULT_NARRATION_GENERATION_DEFAULTS } from "@/types/types";
import { getLectureById } from "@/data/lecture/repository";
import { getProjectSettings } from "@/data/project";
import { updateWorkflowRun } from "@/data/workflow-runs";

export type LectureCreationEventData = {
  prompt: string;
  userId: string;
  runId: string;
  lectureId: number;
  imageDefaults: ImageGenerationDefaults;
  narrationDefaults?: NarrationGenerationDefaults;
  totalWorkflowSteps?: number;
  context?: Record<string, unknown>;
};

const inngest = getInngestApp();

export const startLectureCreation = inngest.createFunction(
  { id: "start-lecture-creation" },
  { event: "app/start-lecture-creation" },
  async ({ event, logger, step, publish }) => {
    const { userId, prompt, runId, lectureId, narrationDefaults, context } =
      event.data as LectureCreationEventData;
    const log = createLectureLogger(runId, logger);

    log.info("Starting lecture workflow");

    // Update workflow status to running
    await step.run("update-workflow-status-running", async () => {
      await updateWorkflowRun({ runId, status: "running" });
    });

    // Send immediate progress update
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      log,
    });
    await publishStatus("Processing lecture request", 0);

    // Get project settings (no longer confirming config from prompt)
    const projectSettings = await step.run("get-project-settings", async () => {
      return await getProjectSettings(userId);
    });

    log.info("Using project settings for generation", { projectSettings });

    const { script } = await step.invoke("create-lecture-script", {
      function: createLectureScript,
      data: {
        userId,
        prompt,
        runId,
        lectureId,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
        researchConfig: projectSettings.research,
        generalConfig: projectSettings.general,
        narrationConfig: projectSettings.narration,
        context,
      },
    });

    const lecture = await step.run("get-lecture-for-images", async () => {
      return await getLectureById({ lectureId });
    });

    if (!lecture) {
      throw new Error(`Lecture ${lectureId} not found`);
    }

    // Extract image settings from project settings
    const imageSettings: ImageGenerationDefaults = {
      width: 1024,
      height: 576,
      aspectRatio: projectSettings.image.aspectRatio,
      size: projectSettings.image.size,
      style: projectSettings.image.style,
      imagesPerSegment: projectSettings.image.imagesPerSegment,
    };

    const generatedImages = await step.invoke("generate-segment-images", {
      function: generateSegmentImages,
      data: {
        userId,
        runId,
        lectureId,
        projectId: lecture.projectId,
        script,
        imageDefaults: imageSettings,
        workflowStep: 3,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
        context,
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
        context,
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
        context,
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
        context,
      },
    });

    log.info("Lecture workflow completed", {
      hasScript: Boolean(script),
      generatedImages: generatedImages?.images?.length ?? 0,
      generatedNarration: generatedNarration?.narration?.length ?? 0,
      hasMusic: Boolean(generatedMusic?.music),
      hasTimeline: Boolean(timeline?.timeline),
    });

    // Update workflow status to succeeded
    await step.run("update-workflow-status-succeeded", async () => {
      await updateWorkflowRun({ runId, status: "succeeded" });
    });

    return { runId };
  }
);
