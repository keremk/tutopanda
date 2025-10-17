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
};

type SegmentPrompts = {
  segmentIndex: number;
  segmentStartImagePrompt: string;
  movieDirections: string;
  styledImagePrompt: string;
  styledMovieDirections: string;
};

type SegmentImage = {
  segmentIndex: number;
  imageBuffer: Buffer;
  imageUrl: string;
};

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

  // ============================================================================
  // STAGE 1: Batch generate all prompts concurrently
  // ============================================================================
  logger?.info("Stage 1: Generating video prompts for all segments");

  let completedPrompts = 0;
  const segmentPrompts: SegmentPrompts[] = await batchWithConcurrency(
    limitedSegments.map((segment, index) => ({ segment, index })),
    async ({ segment, index }) => {
      const segmentIndex = index;

      logger?.info(`Generating video prompts for segment ${segmentIndex + 1}`);

      const { segmentStartImagePrompt, movieDirections } = await generatePrompts(
        segment,
        lectureSummary,
        segmentIndex
      );

      // Apply style to prompts
      const styledImagePrompt = buildStyledVideoImagePrompt({
        basePrompt: segmentStartImagePrompt,
        style: appliedStyle,
      });

      const styledMovieDirections = buildStyledMovieDirections({
        baseDirections: movieDirections,
        style: appliedStyle,
      });

      completedPrompts++;
      await onPromptProgress?.(completedPrompts, limitedSegments.length);

      return {
        segmentIndex,
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

  // ============================================================================
  // STAGE 2: Batch generate all starting images concurrently
  // ============================================================================
  logger?.info("Stage 2: Generating starting images for all segments");

  let completedImages = 0;
  const segmentImages: SegmentImage[] = await batchWithConcurrency(
    segmentPrompts,
    async (promptData) => {
      const { segmentIndex, styledImagePrompt } = promptData;

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

      // Save starting image
      const startingImageId = `video-img-${runId}-${segmentIndex}`;
      const imageUrl = await assetStorage.saveImage(imageBuffer, startingImageId);

      logger?.info(`Starting image saved for segment ${segmentIndex + 1}`, {
        path: imageUrl,
      });

      completedImages++;
      await onImageProgress?.(completedImages, segmentPrompts.length);

      return {
        segmentIndex,
        imageBuffer,
        imageUrl,
      };
    },
    { maxConcurrency }
  );

  logger?.info("Stage 2 complete: All starting images generated", {
    totalImages: segmentImages.length,
  });

  // ============================================================================
  // STAGE 3: Batch generate all videos concurrently
  // ============================================================================
  logger?.info("Stage 3: Generating videos for all segments");

  // Create lookup map for easy access
  const imageMap = new Map(
    segmentImages.map(img => [img.segmentIndex, img])
  );

  let completedVideos = 0;
  const videoAssets: VideoAsset[] = await batchWithConcurrency(
    segmentPrompts,
    async (promptData) => {
      const { segmentIndex, segmentStartImagePrompt, movieDirections, styledMovieDirections } = promptData;
      const imageData = imageMap.get(segmentIndex);

      if (!imageData) {
        throw new Error(`Image not found for segment ${segmentIndex}`);
      }

      logger?.info(`Generating video for segment ${segmentIndex + 1}`);

      const videoBuffer = await generateVideoFn(
        styledMovieDirections,
        imageData.imageBuffer,
        {
          aspectRatio: imageConfig.aspectRatio,
          resolution: videoConfig.resolution,
          duration: videoConfig.duration,
          model: videoConfig.model,
        },
        { logger }
      );

      // Save video
      const videoId = `video-${runId}-${segmentIndex}`;
      const videoUrl = await assetStorage.saveVideo(videoBuffer, videoId);

      logger?.info("Video saved", {
        id: videoId,
        segmentIndex,
        path: videoUrl,
      });

      completedVideos++;
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

  logger?.info("Stage 3 complete: All videos generated");
  logger?.info("Lecture video generation complete (batched pipeline)", {
    totalVideos: videoAssets.length,
  });

  return videoAssets;
}
