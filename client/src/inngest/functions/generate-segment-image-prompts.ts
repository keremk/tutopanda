import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { LectureScript, ImageGenerationDefaults, ImageAsset } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import {
  buildImagePromptUserMessage,
  createImagePromptDeveloperPrompt,
} from "@/prompts/create-image-prompt";

const inngest = getInngestApp();

const MAX_IMAGE_PROMPT_CALLS = Number.parseInt(
  process.env.MAX_IMAGE_PROMPT_CALLS ?? "3",
  10
);

const IMAGE_PROMPT_WORKFLOW_STEP = 3;

type SegmentPrompt = {
  segmentIndex: number;
  prompt: string;
};

export type GenerateSegmentImagePromptsEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  script: LectureScript;
  imageDefaults: ImageGenerationDefaults;
  workflowStep?: number;
  totalWorkflowSteps?: number;
};

const buildImageAssets = ({
  prompts,
  defaults,
  runId,
}: {
  prompts: SegmentPrompt[];
  defaults: ImageGenerationDefaults;
  runId: string;
}): ImageAsset[] => {
  const aspectParts = defaults.aspectRatio
    .split(":")
    .map((value) => Number.parseInt(value, 10));
  const [aspectWidth, aspectHeight] = aspectParts;
  const computedHeight =
    Number.isFinite(aspectWidth) && aspectWidth > 0
      ? Math.round((defaults.width / aspectWidth) * aspectHeight)
      : defaults.height;

  return prompts.map(
    (entry, index) =>
      ({
        id: `img-${runId}-${entry.segmentIndex}-${index}`,
        label: `Segment ${entry.segmentIndex + 1}`,
        prompt: entry.prompt,
        aspectRatio: defaults.aspectRatio,
        width: defaults.width,
        height: computedHeight,
        size: defaults.size,
      } satisfies ImageAsset)
  );
};


export const generateSegmentImagePrompts = inngest.createFunction(
  { id: "generate-segment-image-prompts" },
  { event: "app/generate-segment-image-prompts" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      script,
      imageDefaults,
      workflowStep = IMAGE_PROMPT_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
    } = event.data as GenerateSegmentImagePromptsEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    const segments = script.segments ?? [];
    if (segments.length === 0) {
      const message = "No segments available for image prompt generation";
      log.error(message);
      await publishStatus(message, workflowStep, "error");
      throw new Error(message);
    }

    const limit = Math.min(segments.length, MAX_IMAGE_PROMPT_CALLS);

    if (limit <= 0) {
      const message = "Skipping image prompt generation (limit is zero)";
      log.info(message, { limit });
      await publishStatus(message, workflowStep, "complete");
      return { runId, prompts: [] as SegmentPrompt[], skipped: true };
    }

    const segmentsToProcess = segments.slice(0, limit);

    await publishStatus(
      `Generating image prompts for ${segmentsToProcess.length} segment${segmentsToProcess.length === 1 ? "" : "s"}`,
      workflowStep
    );

    const prompts = await Promise.all(
      segmentsToProcess.map((segment, index) =>
        step.run(`segment-image-prompt-${index}`, async () => {
          const segmentPosition = index + 1;
          const userPrompt = buildImagePromptUserMessage({
            segment,
            segmentIndex: index,
          });

          log.info("Generating image prompt", { segmentIndex: segmentPosition });

          const { text } = await generateText({
            model: openai("gpt-5-mini"),
            system: createImagePromptDeveloperPrompt,
            prompt: userPrompt,
          });

          const promptText = text.trim();

          if (!promptText) {
            throw new Error("Model returned empty image prompt");
          }

          await publishStatus(
            `Segment ${segmentPosition}/${segmentsToProcess.length} prompt ready`,
            workflowStep
          );

          return {
            segmentIndex: index,
            prompt: promptText,
          } satisfies SegmentPrompt;
        })
      )
    );

    await publishStatus("Image prompts ready", workflowStep, "complete");

    log.info("Image prompt generation complete", {
      processedSegments: segmentsToProcess.length,
    });

    await step.run("save-image-prompts", async () => {
      const assets = buildImageAssets({
        prompts,
        defaults: imageDefaults,
        runId,
      });

      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { images: assets },
      });
    });

    return { runId, prompts };
  }
);
