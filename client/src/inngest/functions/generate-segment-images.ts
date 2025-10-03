import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import Replicate from "replicate";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { LectureScript, ImageGenerationDefaults, ImageAsset } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { setupFileStorage, saveFileToStorage } from "@/lib/storage-utils";
import {
  buildImagePromptUserMessage,
  createImagePromptDeveloperPrompt,
  singleImagePromptSchema,
  multipleImagePromptsSchema,
} from "@/prompts/create-image-prompt";

const inngest = getInngestApp();
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const MAX_IMAGE_SEGMENT_PROMPT_CALLS = Number.parseInt(
  process.env.MAX_IMAGE_SEGMENT_PROMPT_CALLS ?? "3",
  10
);

const IMAGE_GENERATION_WORKFLOW_STEP = 3;

export type GenerateSegmentImagesEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  script: LectureScript;
  imageDefaults: ImageGenerationDefaults;
  workflowStep?: number;
  totalWorkflowSteps?: number;
};

const buildImageAssets = ({
  segmentIndex,
  prompts,
  defaults,
  runId,
}: {
  segmentIndex: number;
  prompts: string[];
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

  return prompts.map((prompt, imageIndex) => ({
    id: `img-${runId}-${segmentIndex}-${imageIndex}`,
    label: `Segment ${segmentIndex + 1}${prompts.length > 1 ? ` Image ${imageIndex + 1}` : ""}`,
    prompt,
    aspectRatio: defaults.aspectRatio,
    width: defaults.width,
    height: computedHeight,
    size: defaults.size,
  } satisfies ImageAsset));
};

export const generateSegmentImages = inngest.createFunction(
  { id: "generate-segment-images" },
  { event: "app/generate-segment-images" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      script,
      imageDefaults,
      workflowStep = IMAGE_GENERATION_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
    } = event.data as GenerateSegmentImagesEvent;

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
      const message = "No segments available for image generation";
      log.error(message);
      await publishStatus(message, workflowStep, "error");
      throw new Error(message);
    }

    await step.run("validate-project-access", async () => {
      const project = await getProjectById(projectId, userId);
      if (!project) {
        throw new Error(`Project ${projectId} not found or access denied`);
      }
    });

    const storage = setupFileStorage();
    const imagesPerSegment = imageDefaults.imagesPerSegment ?? 1;
    const limit = Math.min(segments.length, MAX_IMAGE_SEGMENT_PROMPT_CALLS);

    if (limit <= 0) {
      const message = "Skipping image generation (limit is zero)";
      log.info(message, { limit });
      await publishStatus(message, workflowStep, "complete");
      return { runId, images: [] as ImageAsset[], skipped: true };
    }

    const segmentsToProcess = segments.slice(0, limit);
    const totalImages = segmentsToProcess.length * imagesPerSegment;

    await publishStatus(
      `Generating ${totalImages} image${totalImages > 1 ? "s" : ""} for ${segmentsToProcess.length} segment${segmentsToProcess.length === 1 ? "" : "s"}`,
      workflowStep
    );

    // Process each segment: generate prompts then generate images
    const allImages = await Promise.all(
      segmentsToProcess.map((segment, segmentIndex) =>
        step.run(`generate-images-segment-${segmentIndex}`, async () => {
          const segmentPosition = segmentIndex + 1;

          // Step 1: Generate image prompts using structured output
          log.info("Generating image prompts", { segmentIndex: segmentPosition, imagesPerSegment });

          const userPrompt = buildImagePromptUserMessage({
            segment,
            segmentIndex,
            imagesPerSegment,
          });

          const schema = imagesPerSegment > 1 ? multipleImagePromptsSchema : singleImagePromptSchema;

          const { object } = await generateObject({
            model: openai("gpt-5-mini"),
            system: createImagePromptDeveloperPrompt,
            prompt: userPrompt,
            schema,
          });

          const basePrompts = imagesPerSegment > 1
            ? (object as { prompts: string[] }).prompts
            : [(object as { prompt: string }).prompt];

          // Step 2: Append style to prompts if specified
          const stylePrefix = imageDefaults.style ? `${imageDefaults.style} style, ` : "";
          const styledPrompts = basePrompts.map(p => `${stylePrefix}${p}`);

          log.info("Prompts generated", {
            segmentIndex: segmentPosition,
            promptCount: styledPrompts.length,
            style: imageDefaults.style
          });

          // Step 3: Build image assets
          const imageAssets = buildImageAssets({
            segmentIndex,
            prompts: styledPrompts,
            defaults: imageDefaults,
            runId,
          });

          // Step 4: Generate images using Replicate
          const generatedImages = await Promise.all(
            imageAssets.map(async (imageAsset, imageIndex) => {
              log.info("Generating image", {
                imageId: imageAsset.id,
                segmentIndex: segmentPosition,
                imageIndex,
                prompt: imageAsset.prompt.substring(0, 100) + "...",
                aspectRatio: imageAsset.aspectRatio,
                size: imageAsset.size,
              });

              // Map config size values to Replicate API size values
              const sizeMapping: Record<string, string> = {
                "480": "1K",
                "720": "1K",
                "1080": "1K",
              };
              const replicateSize = sizeMapping[imageAsset.size || "1080"] || "1K";

              const input = {
                size: replicateSize,
                prompt: imageAsset.prompt,
                max_images: 1,
                image_input: [],
                aspect_ratio: imageAsset.aspectRatio || "16:9",
                sequential_image_generation: "disabled"
              };

              const output = await replicate.run("bytedance/seedream-4", { input }) as any[];

              if (!output || !Array.isArray(output) || !output[0]) {
                throw new Error(`Image generation failed for ${imageAsset.id}`);
              }

              const filePath = `${userId}/${projectId}/images/${imageAsset.id}.jpg`;
              await saveFileToStorage(storage, output[0], filePath);

              return {
                ...imageAsset,
                sourceUrl: filePath,
              } satisfies ImageAsset;
            })
          );

          await publishStatus(
            `Segment ${segmentPosition}/${segmentsToProcess.length} images generated`,
            workflowStep
          );

          return generatedImages;
        })
      )
    );

    const flattenedImages = allImages.flat();

    await publishStatus("Images generated successfully", workflowStep, "complete");

    log.info("Image generation complete", {
      generatedImages: flattenedImages.length,
      segments: segmentsToProcess.length,
    });

    await step.run("save-generated-images", async () => {
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { images: flattenedImages },
      });
    });

    return { runId, images: flattenedImages };
  }
);
