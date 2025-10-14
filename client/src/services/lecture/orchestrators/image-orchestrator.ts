import type { LectureScript, ImageAsset, ImageGenerationDefaults } from "@/types/types";
import { generatePromptsForSegment } from "@/services/media-generation/image/prompt-generator";
import {
  batchWithConcurrency,
  generateImagesThrottled,
  type ImageGenerationRequest,
} from "@/services/media-generation/core";
import type { Logger } from "@/services/media-generation/core";
import { DEFAULT_IMAGE_MODEL } from "@/lib/models";
import type { LectureAssetStorage } from "@/services/lecture/storage";

/**
 * Request for generating all lecture images
 */
export type GenerateLectureImagesRequest = {
  script: LectureScript;
  config: ImageGenerationDefaults;
  runId: string;
};

/**
 * Context for image generation (where/who)
 */
export type ImageGenerationContext = {
  userId: string;
  projectId: number;
  lectureId: number;
  maxConcurrency?: number;
  maxPromptConcurrency?: number;
};

/**
 * Dependencies for image orchestrator (injected for testability)
 */
export type ImageOrchestratorDeps = {
  generatePrompts?: typeof generatePromptsForSegment;
  generateImages?: typeof generateImagesThrottled;
  assetStorage: LectureAssetStorage;
  logger?: Logger;
  onImageProgress?: (current: number, total: number) => void | Promise<void>;
  onPromptProgress?: (current: number, total: number) => void | Promise<void>;
};

/**
 * Generate images for all segments in a lecture.
 * Domain orchestrator that coordinates prompt generation, image generation, and storage.
 *
 * @param request - Lecture script and image generation config
 * @param context - User/project context
 * @param deps - Injected dependencies for testability
 * @returns Array of image assets with URLs
 */
export async function generateLectureImages(
  request: GenerateLectureImagesRequest,
  context: ImageGenerationContext,
  deps: ImageOrchestratorDeps
): Promise<ImageAsset[]> {
  const { script, config, runId } = request;
  const { maxConcurrency = 5, maxPromptConcurrency } = context;
  const {
    generatePrompts = generatePromptsForSegment,
    generateImages = generateImagesThrottled,
    assetStorage,
    logger,
    onImageProgress,
    onPromptProgress,
  } = deps;

  const segments = script.segments || [];
  const imagesPerSegment = config.imagesPerSegment ?? 1;

  logger?.info("Starting lecture image generation", {
    segmentCount: segments.length,
    imagesPerSegment,
    totalImages: segments.length * imagesPerSegment,
  });

  // Step 1: Generate prompts for all segments
  const promptConcurrency = Math.max(
    1,
    maxPromptConcurrency ?? maxConcurrency
  );

  const segmentPromptInputs = segments.map((segment, segmentIndex) => ({
    segment,
    segmentIndex,
  }));

  let completedPromptSegments = 0;

  const promptResults = await batchWithConcurrency(
    segmentPromptInputs,
    async ({ segment, segmentIndex }) => {
      const prompts = await generatePrompts({
        segment,
        segmentIndex,
        imagesPerSegment,
        style: config.style,
      });

      completedPromptSegments += 1;
      await onPromptProgress?.(completedPromptSegments, segments.length);

      return {
        segmentIndex,
        prompts,
      };
    },
    {
      maxConcurrency: promptConcurrency,
    }
  );

  const allPrompts = promptResults.flatMap(({ segmentIndex, prompts }) =>
    prompts.map((prompt, imageIndex) => ({
      segmentIndex,
      imageIndex,
      prompt,
    }))
  );

  logger?.info("Prompts generated", {
    totalPrompts: allPrompts.length,
    promptConcurrency,
  });

  // Step 2: Build image generation requests
  const aspectParts = config.aspectRatio
    .split(":")
    .map((value) => Number.parseInt(value, 10));
  const [aspectWidth, aspectHeight] = aspectParts;
  const computedHeight =
    Number.isFinite(aspectWidth) && aspectWidth > 0
      ? Math.round((config.width / aspectWidth) * aspectHeight)
      : config.height;

  const imageRequests: ImageGenerationRequest[] = allPrompts.map((item) => ({
    prompt: item.prompt,
    config: {
      aspectRatio: config.aspectRatio,
      size: config.size,
      width: config.width,
      height: computedHeight,
      model: DEFAULT_IMAGE_MODEL,
    },
  }));

  // Step 3: Generate images with throttling
  const buffers = await generateImages(imageRequests, {
    maxConcurrency,
    logger,
    onBatchComplete: (batchIndex, totalBatches) => {
      logger?.info(`Completed batch ${batchIndex}/${totalBatches}`);
    },
    onItemComplete: async (current, total) => {
      await onImageProgress?.(current, total);
    },
  });

  // Step 4: Save images and build assets
  const imageAssets: ImageAsset[] = await Promise.all(
    buffers.map(async (buffer, index) => {
      const { segmentIndex, imageIndex, prompt } = allPrompts[index];
      const id = `img-${runId}-${segmentIndex}-${imageIndex}`;
      const sourceUrl = await assetStorage.saveImage(buffer, id);

      logger?.info("Image saved", {
        id,
        segmentIndex,
        imageIndex,
        path: sourceUrl,
      });

      return {
        id,
        label: `Segment ${segmentIndex + 1}${imagesPerSegment > 1 ? ` Image ${imageIndex + 1}` : ""}`,
        prompt,
        aspectRatio: config.aspectRatio,
        width: config.width,
        height: computedHeight,
        size: config.size,
        model: DEFAULT_IMAGE_MODEL,
        sourceUrl,
      };
    })
  );

  logger?.info("Lecture image generation complete", {
    totalImages: imageAssets.length,
  });

  return imageAssets;
}

/**
 * Request for regenerating a single image
 */
export type RegenerateImageRequest = {
  prompt: string;
  config: ImageGenerationDefaults;
  imageId: string;
};

/**
 * Regenerate a single image.
 * Used for UI-driven regeneration or agent-driven updates.
 *
 * @param request - Prompt and image config
 * @param context - User/project context
 * @param deps - Injected dependencies for testability
 * @returns Single image asset with URL
 */
export async function regenerateImage(
  request: RegenerateImageRequest,
  _context: ImageGenerationContext,
  deps: ImageOrchestratorDeps
): Promise<ImageAsset> {
  const { prompt, config, imageId } = request;
  const { generateImages = generateImagesThrottled, assetStorage, logger } = deps;

  logger?.info("Regenerating image", {
    imageId,
    promptPreview: prompt.substring(0, 100) + "...",
  });

  // Calculate dimensions
  const aspectParts = config.aspectRatio
    .split(":")
    .map((value) => Number.parseInt(value, 10));
  const [aspectWidth, aspectHeight] = aspectParts;
  const computedHeight =
    Number.isFinite(aspectWidth) && aspectWidth > 0
      ? Math.round((config.width / aspectWidth) * aspectHeight)
      : config.height;

  // Generate single image
  const [buffer] = await generateImages(
    [
      {
        prompt,
        config: {
          aspectRatio: config.aspectRatio,
          size: config.size,
          width: config.width,
          height: computedHeight,
          model: DEFAULT_IMAGE_MODEL,
        },
      },
    ],
    { logger }
  );

  // Save image
  const sourceUrl = await assetStorage.saveImage(buffer, imageId);

  logger?.info("Image regenerated and saved", {
    imageId,
    path: sourceUrl,
  });

  return {
    id: imageId,
    label: "Regenerated Image",
    prompt,
    aspectRatio: config.aspectRatio,
    width: config.width,
    height: computedHeight,
    size: config.size,
    model: DEFAULT_IMAGE_MODEL,
    sourceUrl,
  };
}
