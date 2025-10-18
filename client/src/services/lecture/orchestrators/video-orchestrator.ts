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
import { batchWithConcurrency } from "@/services/media-generation/core";
import type { Logger } from "@/services/media-generation/core";
import { DEFAULT_VIDEO_MODEL } from "@/lib/models";
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

export type VideoSegmentImage = {
  segmentIndex: number;
  imageId: string;
  imageUrl: string;
};

type GenerateVideoSegmentPromptsOptions = {
  style?: ImageGenerationDefaults["style"];
  lectureSummary: string;
  maxConcurrency?: number;
  generatePrompts?: typeof generateVideoPrompts;
  logger?: Logger;
  onPromptProgress?: (current: number, total: number) => void | Promise<void>;
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
): Promise<VideoSegmentImage[]> {
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
  const segmentImages: VideoSegmentImage[] = await batchWithConcurrency(
    segmentPrompts,
    async ({ segmentIndex, styledImagePrompt }) => {
      logger?.info(`Generating starting image for segment ${segmentIndex + 1}`);

      const imageBuffer = await generateImageFn(
        styledImagePrompt,
        {
          aspectRatio: imageConfig.aspectRatio,
          size: imageConfig.size,
          width: imageConfig.width,
          height: imageConfig.height,
        },
        { logger }
      );

      const imageId = `video-img-${runId}-${segmentIndex}`;
      const imageUrl = await assetStorage.saveImage(imageBuffer, imageId);

      logger?.info(`Starting image saved for segment ${segmentIndex + 1}`, {
        path: imageUrl,
      });

      completedImages += 1;
      await onImageProgress?.(completedImages, segmentPrompts.length);

      return {
        segmentIndex,
        imageId,
        imageUrl,
      };
    },
    { maxConcurrency }
  );

  logger?.info("Stage 2 complete: All starting images generated", {
    totalImages: segmentImages.length,
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
  segmentImages: VideoSegmentImage[],
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

  let completedVideos = 0;
  const videoAssets: VideoAsset[] = await batchWithConcurrency(
    segmentPrompts,
    async ({
      segmentIndex,
      segmentStartImagePrompt,
      movieDirections,
      styledMovieDirections,
    }) => {
      const imageData = imageMap.get(segmentIndex);

      if (!imageData) {
        throw new Error(`Image not found for segment ${segmentIndex}`);
      }

      const imagePath = assetStorage.resolveImagePath(imageData.imageId);
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

      const videoId = `video-${runId}-${segmentIndex}`;
      const videoUrl = await assetStorage.saveVideo(videoBuffer, videoId);

      logger?.info("Video saved", {
        id: videoId,
        segmentIndex,
        path: videoUrl,
      });

      completedVideos += 1;
      await onVideoProgress?.(completedVideos, segmentPrompts.length);

      return {
        id: videoId,
        label: `Segment ${segmentIndex + 1} Video`,
        segmentStartImagePrompt,
        movieDirections,
        model: videoConfig.model || DEFAULT_VIDEO_MODEL,
        resolution: videoConfig.resolution,
        duration: Number.parseInt(videoConfig.duration || "10", 10),
        aspectRatio: imageConfig.aspectRatio,
        startingImageUrl: imageData.imageUrl,
      };
    },
    { maxConcurrency }
  );

  logger?.info("Stage 3 complete: All videos generated", {
    totalVideos: videoAssets.length,
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
  logger?.info("Lecture video generation complete (batched pipeline)", {
    totalVideos: videoAssets.length,
  });

  return videoAssets;
}
