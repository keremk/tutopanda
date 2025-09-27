import { getInngestApp } from "@/inngest/client";
import { createLectureLogger, LECTURE_WORKFLOW_TOTAL_STEPS } from "@/inngest/functions/workflow-utils";
import { createLectureScript } from "@/inngest/functions/create-lecture-script";
import { generateSegmentImagePrompts } from "@/inngest/functions/generate-segment-image-prompts";

export type LectureCreationEventData = {
  prompt: string;
  userId: string;
  runId: string;
  totalWorkflowSteps?: number;
};

const inngest = getInngestApp();

export const startLectureCreation = inngest.createFunction(
  { id: "start-lecture-creation" },
  { event: "app/start-lecture-creation" },
  async ({ event, logger, step }) => {
    const { userId, prompt, runId } = event.data as LectureCreationEventData;
    const log = createLectureLogger(runId, logger);

    log.info("Starting lecture workflow");

    const { script } = await step.invoke("create-lecture-script", {
      function: createLectureScript,
      data: {
        userId,
        prompt,
        runId,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      },
    });

    const imagePrompts = await step.invoke("generate-segment-image-prompts", {
      function: generateSegmentImagePrompts,
      data: {
        userId,
        runId,
        script,
        workflowStep: 3,
        totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      },
    });

    log.info("Lecture workflow completed", {
      hasScript: Boolean(script),
      imagePrompts: imagePrompts?.prompts?.length ?? 0,
    });

    return { runId };
  }
);

