import type {
  LectureScript,
  VideoAsset,
  VideoConfig as VideoConfigType,
  ImageGenerationDefaults,
} from "@/types/types";
import { generateVideoPrompts } from "@/services/media-generation/video/prompt-generator";
import { generateVideo } from "@/services/media-generation/video/video-generator";
import { generateImage } from "@/services/media-generation/image/image-generator";
import { buildStyledVideoImagePrompt, buildStyledMovieDirections } from "@/prompts/create-video-prompt";
import {
  batchWithConcurrency,
  createMediaGenerationError,
  isMediaGenerationError,
} from "@/services/media-generation/core";
import type { Logger, MediaGenerationError } from "@/services/media-generation/core";
import { DEFAULT_IMAGE_MODEL, DEFAULT_VIDEO_MODEL } from "@/lib/models";
import type { LectureAssetStorage } from "@/services/lecture/storage";
import { setupFileStorage } from "@/lib/storage-utils";

export type GenerateLectureVideosRequest = {
  script: LectureScript;
  lectureSummary: string;
  videoConfig: VideoConfigType;
  imageConfig: ImageGenerationDefaults;
  maxVideoSegments: number;
  runId: string;
};

export type VideoGenerationContext = {
  userId: string;
  projectId: number;
  lectureId: number;
  maxConcurrency?: number;
};

export type VideoOrchestratorDeps = {
  generatePrompts?: typeof generateVideoPrompts;
  generateVideoFn?: typeof generateVideo;
  generateImageFn?: typeof generateImage;
  assetStorage: LectureAssetStorage;
  logger?: Logger;
  onPromptProgress?: (current: number, total: number) => void | Promise<void>;
  onImageProgress?: (current: number, total: number) => void | Promise<void>;
  onVideoProgress?: (current: number, total: number) => void | Promise<void>;
  loadImageFn?: (imagePath: string) => Promise<Buffer>;
};

export type VideoSegmentPrompt = {
  segmentIndex: number;
  segmentStartImagePrompt: string;
  movieDirections: string;
  styledImagePrompt: string;
  styledMovieDirections: string;
};

export type VideoSegmentImageSuccess = {
  segmentIndex: number;
  imageId: string;
  ok: true;
};

export type VideoSegmentImageResult =
  | VideoSegmentImageSuccess
  | { segmentIndex: number; ok: false; error: MediaGenerationError };

type GenerateVideoSegmentPromptsOptions = {
  style?: ImageGenerationDefaults["style"];
  lectureSummary: string;
  maxConcurrency?: number;
  generatePrompts?: typeof generateVideoPrompts;
  logger?: Logger;
  onPromptProgress?: (current: number, total: number) => void | Promise<void>;
  imageModel?: string;
};

export async function generateVideoSegmentPrompts(
  segments: NonNullable<LectureScript["segments"]>,
  options: GenerateVideoSegmentPromptsOptions
): Promise<VideoSegmentPrompt[]> {
  const {
    style,
    lectureSummary,
    maxConcurrency = 5,
    generatePrompts = generateVideoPrompts,
    logger,
    onPromptProgress,
  } = options;

  logger?.info("Stage 1: Generating video prompts for all segments");

  let completedPrompts = 0;
  const segmentPrompts: VideoSegmentPrompt[] = await batchWithConcurrency(
    segments.map((segment, index) => ({ segment, index })),
    async ({ segment, index }) => {
      logger?.info(`Generating video prompts for segment ${index + 1}`);

      const { segmentStartImagePrompt, movieDirections } = await generatePrompts(
        segment,
        lectureSummary,
        index
      );

      const styledImagePrompt = buildStyledVideoImagePrompt({
        basePrompt: segmentStartImagePrompt,
        style,
        model: options.imageModel,
      });

      const styledMovieDirections = buildStyledMovieDirections({
        baseDirections: movieDirections,
        style,
      });

      completedPrompts += 1;
      await onPromptProgress?.(completedPrompts, segments.length);

      return {
        segmentIndex: index,
        segmentStartImagePrompt,
        movieDirections,
        styledImagePrompt,
        styledMovieDirections,
      };
    },
    { maxConcurrency }
  );

  logger?.info("Stage 1 complete: All prompts generated", {
    totalPrompts: segmentPrompts.length,
  });

  return segmentPrompts;
}

type GenerateVideoStartingImagesOptions = {
  imageConfig: ImageGenerationDefaults;
  runId: string;
  assetStorage: LectureAssetStorage;
  maxConcurrency?: number;
  generateImageFn?: typeof generateImage;
  logger?: Logger;
  onImageProgress?: (current: number, total: number) => void | Promise<void>;
};

export async function generateVideoStartingImages(
  segmentPrompts: VideoSegmentPrompt[],
  options: GenerateVideoStartingImagesOptions
): Promise<VideoSegmentImageResult[]> {
  const {
    imageConfig,
    runId,
    assetStorage,
    maxConcurrency = 5,
    generateImageFn = generateImage,
    logger,
    onImageProgress,
  } = options;

  logger?.info("Stage 2: Generating starting images for all segments");

  let completedImages = 0;
  const segmentImages: VideoSegmentImageResult[] = await batchWithConcurrency(
    segmentPrompts,
    async ({ segmentIndex, styledImagePrompt }) => {
      logger?.info(`Generating starting image for segment ${segmentIndex + 1}`);
      try {
        const imageBuffer = await generateImageFn(
          styledImagePrompt,
          {
            aspectRatio: imageConfig.aspectRatio,
            size: imageConfig.size,
            width: imageConfig.width,
            height: imageConfig.height,
            model: imageConfig.model,
          },
          { logger }
        );

        const imageId = `video-img-${runId}-${segmentIndex}`;
        const imagePath = await assetStorage.saveImage(imageBuffer, imageId);

        logger?.info(`Starting image saved for segment ${segmentIndex + 1}`, {
          path: imagePath,
        });

        completedImages += 1;
        await onImageProgress?.(completedImages, segmentPrompts.length);

        return {
          segmentIndex,
          imageId,
          ok: true,
        } as VideoSegmentImageResult;
      } catch (error) {
        let mediaError: MediaGenerationError;

        if (isMediaGenerationError(error)) {
          mediaError = error;
        } else {
          mediaError = createMediaGenerationError({
            code: "UNKNOWN",
            provider: "image",
            model: imageConfig.model || DEFAULT_IMAGE_MODEL,
            message: "Unexpected error during starting image generation",
            isRetryable: false,
            userActionRequired: false,
            cause: error,
          });
        }

        logger?.warn?.("Starting image generation failed", {
          segmentIndex,
          code: mediaError.code,
          message: mediaError.message,
          providerCode: mediaError.providerCode,
        });

        completedImages += 1;
        await onImageProgress?.(completedImages, segmentPrompts.length);

        return {
          segmentIndex,
          ok: false,
          error: mediaError,
        } as VideoSegmentImageResult;
      }
    },
    { maxConcurrency }
  );

  const successfulImages = segmentImages.filter((image) => image.ok).length;
  const failedImages = segmentImages.length - successfulImages;

  logger?.info("Stage 2 complete: Starting images processed", {
    totalSegments: segmentImages.length,
    successfulImages,
    failedImages,
  });

  return segmentImages;
}

type GenerateVideoAssetsOptions = {
  videoConfig: VideoConfigType;
  imageConfig: ImageGenerationDefaults;
  runId: string;
  assetStorage: LectureAssetStorage;
  maxConcurrency?: number;
  generateVideoFn?: typeof generateVideo;
  logger?: Logger;
  onVideoProgress?: (current: number, total: number) => void | Promise<void>;
  loadImageFn?: (imagePath: string) => Promise<Buffer>;
};

export async function generateVideoAssets(
  segmentPrompts: VideoSegmentPrompt[],
  segmentImages: VideoSegmentImageResult[],
  options: GenerateVideoAssetsOptions
): Promise<VideoAsset[]> {
  const {
    videoConfig,
    imageConfig,
    runId,
    assetStorage,
    maxConcurrency = 5,
    generateVideoFn = generateVideo,
    logger,
    onVideoProgress,
    loadImageFn,
  } = options;

  logger?.info("Stage 3: Generating videos for all segments");

  const imageMap = new Map(segmentImages.map((image) => [image.segmentIndex, image]));
  const storage = loadImageFn ? null : setupFileStorage();
  const loadImage = loadImageFn ?? (async (imagePath: string) => storage!.readToBuffer(imagePath));

  let processedVideos = 0;
  let successfulVideos = 0;
  let failedVideos = 0;
  let blockedByImage = 0;

  const videoAssets: VideoAsset[] = await batchWithConcurrency(
    segmentPrompts,
    async ({
      segmentIndex,
      segmentStartImagePrompt,
      movieDirections,
      styledMovieDirections,
    }) => {
      const imageResult = imageMap.get(segmentIndex);
      const videoId = `video-${runId}-${segmentIndex}`;
      const baseAsset: VideoAsset = {
        id: videoId,
        label: `Segment ${segmentIndex + 1} Video`,
        segmentStartImagePrompt,
        movieDirections,
        model: videoConfig.model || DEFAULT_VIDEO_MODEL,
        resolution: videoConfig.resolution,
        duration: Number.parseInt(videoConfig.duration || "10", 10),
        aspectRatio: imageConfig.aspectRatio,
        startingImageId: imageResult && imageResult.ok ? imageResult.imageId : undefined,
        startingImageModel: imageConfig.model || DEFAULT_IMAGE_MODEL,
      };

      try {
        if (!imageResult || !imageResult.ok) {
          const mediaError = imageResult?.error ??
            createMediaGenerationError({
              code: "PROVIDER_FAILURE",
              provider: "image",
              model: imageConfig.model || DEFAULT_IMAGE_MODEL,
              message: "Starting image unavailable for video generation",
              isRetryable: false,
              userActionRequired: true,
            });

          logger?.warn?.("Video generation blocked by image failure", {
            segmentIndex,
            code: mediaError.code,
            message: mediaError.message,
            providerCode: mediaError.providerCode,
          });

          blockedByImage += 1;

          return {
            ...baseAsset,
            status: mediaError.userActionRequired ? "needs_prompt_update" : "failed",
            error: {
              code: mediaError.code,
              message: mediaError.message,
              provider: mediaError.provider,
              providerCode: mediaError.providerCode,
            },
          } as VideoAsset;
        }

        const imagePath = assetStorage.resolveImagePath(imageResult.imageId);
        const startingImageBuffer = await loadImage(imagePath);

        logger?.info(`Generating video for segment ${segmentIndex + 1}`);

        const videoBuffer = await generateVideoFn(
          styledMovieDirections,
          startingImageBuffer,
          {
            aspectRatio: imageConfig.aspectRatio,
            resolution: videoConfig.resolution,
            duration: videoConfig.duration,
            model: videoConfig.model,
          },
          { logger }
        );

        const videoPath = await assetStorage.saveVideo(videoBuffer, videoId);

        logger?.info("Video saved", {
          id: videoId,
          segmentIndex,
          path: videoPath,
        });

        successfulVideos += 1;

        return {
          ...baseAsset,
          videoPath,
          status: "generated",
        } as VideoAsset;
      } catch (error) {
        let mediaError: MediaGenerationError;

        if (isMediaGenerationError(error)) {
          mediaError = error;
        } else {
          mediaError = createMediaGenerationError({
            code: "UNKNOWN",
            provider: "video",
            model: videoConfig.model || DEFAULT_VIDEO_MODEL,
            message: "Unexpected error during video generation",
            isRetryable: false,
            userActionRequired: false,
            cause: error,
          });
        }

        failedVideos += 1;

        logger?.warn?.("Video generation failed", {
          segmentIndex,
          code: mediaError.code,
          message: mediaError.message,
          providerCode: mediaError.providerCode,
        });

        return {
          ...baseAsset,
          status: mediaError.userActionRequired ? "needs_prompt_update" : "failed",
          error: {
            code: mediaError.code,
            message: mediaError.message,
            provider: mediaError.provider,
            providerCode: mediaError.providerCode,
          },
        } as VideoAsset;
      } finally {
        processedVideos += 1;
        await onVideoProgress?.(processedVideos, segmentPrompts.length);
      }
    },
    { maxConcurrency }
  );

  logger?.info("Stage 3 complete: Video segments processed", {
    totalSegments: videoAssets.length,
    successfulVideos,
    failedVideos,
    blockedByImage,
  });

  return videoAssets;
}

/**
 * Generate videos for all segments in a lecture using a batched pipeline approach.
 *
 * Pipeline stages:
 * 1. Batch generate all prompts (image + movie) concurrently
 * 2. Batch generate all starting images concurrently
 * 3. Batch generate all videos concurrently
 *
 * This approach minimizes overall latency by maximizing parallelization.
 */
export async function generateLectureVideos(
  request: GenerateLectureVideosRequest,
  context: VideoGenerationContext,
  deps: VideoOrchestratorDeps
): Promise<VideoAsset[]> {
  const { script, lectureSummary, videoConfig, imageConfig, maxVideoSegments, runId } = request;
  const { maxConcurrency = 5 } = context;
  const {
    generatePrompts = generateVideoPrompts,
    generateVideoFn = generateVideo,
    generateImageFn = generateImage,
    assetStorage,
    logger,
    onPromptProgress,
    onImageProgress,
    onVideoProgress,
    loadImageFn,
  } = deps;

  const segments = script.segments || [];
  const limitedSegments = segments.slice(0, maxVideoSegments);
  const appliedStyle = imageConfig.style;

  logger?.info("Starting lecture video generation (batched pipeline)", {
    segmentCount: limitedSegments.length,
    maxVideoSegments,
    maxConcurrency,
    style: appliedStyle,
  });

  const segmentPrompts = await generateVideoSegmentPrompts(limitedSegments, {
    style: appliedStyle,
    lectureSummary,
    maxConcurrency,
    generatePrompts,
    logger,
    onPromptProgress,
  });

  const segmentImages = await generateVideoStartingImages(segmentPrompts, {
    imageConfig,
    runId,
    assetStorage,
    maxConcurrency,
    generateImageFn,
    logger,
    onImageProgress,
  });

  const videoAssets = await generateVideoAssets(segmentPrompts, segmentImages, {
    videoConfig,
    imageConfig,
    runId,
    assetStorage,
    maxConcurrency,
    generateVideoFn,
    logger,
    onVideoProgress,
    loadImageFn,
  });
  const generatedCount = videoAssets.filter((asset) => asset.videoPath).length;
  const needsPromptUpdateCount = videoAssets.filter((asset) => asset.status === "needs_prompt_update").length;
  const failedCount = videoAssets.filter((asset) => asset.status === "failed").length;

  logger?.info("Lecture video generation complete (batched pipeline)", {
    totalVideos: videoAssets.length,
    generatedCount,
    needsPromptUpdateCount,
    failedCount,
  });

  return videoAssets;
}
