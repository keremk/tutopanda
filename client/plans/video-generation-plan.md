# Video Generation Implementation Plan

## Overview
Add video generation capability per segment, controlled by `useVideo` flag in general configuration. Videos are generated in 3 batched stages for optimal concurrency: (1) Generate all prompts, (2) Generate all starting images, (3) Generate all videos.

## Architecture Summary
- **Pattern**: Follow existing image/music generation patterns
- **Location**: `client/src/services/media-generation/video/`
- **Orchestrator**: `client/src/services/lecture/orchestrators/video-orchestrator.ts`
- **Storage**: `{userId}/{projectId}/{lectureId}/videos/{videoId}.mp4`
- **Provider**: Replicate with `bytedance/seedance-1-lite`
- **Processing**: Batched pipeline (prompts → images → videos) with max 5 concurrent operations per batch

---

## Batch Processing Flow

```
Segments 1-5
    ↓
┌─────────────────────────────────────┐
│  Batch 1: Generate Prompts (5x)    │  ← All prompts generated concurrently
│  Result: imagePrompt + moviePrompt │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Batch 2: Generate Images (5x)     │  ← All starting images concurrently
│  Input: imagePrompts from Batch 1  │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────┐
│  Batch 3: Generate Videos (5x)     │  ← All videos concurrently
│  Input: images + moviePrompts      │
└─────────────────────────────────────┘
    ↓
Save all video assets
```

---

## Implementation Steps

### 1. Add Video Asset Type
**File**: `client/src/types/types.ts`

Add video asset schema and update lecture content schema:

```typescript
export const videoAssetSchema = baseAssetSchema
  .extend({
    segmentStartImagePrompt: z.string(),
    movieDirections: z.string(),
    model: z.string().optional(),
    resolution: z.enum(videoResolutionValues).optional(),
    duration: z.number().nonnegative().optional(),
    aspectRatio: z.enum(aspectRatioValues).optional(),
    startingImageUrl: z.string().optional(), // Reference to generated starting image
  })
  .passthrough();

export type VideoAsset = z.infer<typeof videoAssetSchema>;
```

Update `lectureContentSchema`:
```typescript
export const lectureContentSchema = z.object({
  // ... existing fields
  videos: z.array(videoAssetSchema).nullish(),
});
```

Update `LectureAssetCategory` type:
```typescript
export type LectureAssetCategory = "images" | "music" | "narration" | "videos";
```

---

### 2. Update Storage Handler
**File**: `client/src/services/lecture/storage/lecture-asset-storage.ts`

Add video storage methods following the existing pattern:

```typescript
const saveVideo = (
  content: Buffer | Uint8Array | ReadableStream,
  videoId: string
) => saveAsset("videos", `${videoId}.mp4`, content);

const resolveVideoPath = (videoId: string) =>
  resolveAssetPath("videos", `${videoId}.mp4`);

// Add to return object
return {
  // ... existing methods
  saveVideo,
  resolveVideoPath,
};
```

Update type:
```typescript
export type LectureAssetStorage = {
  // ... existing methods
  saveVideo: (
    content: Buffer | Uint8Array | ReadableStream,
    videoId: string
  ) => Promise<string>;
  resolveVideoPath: (videoId: string) => string;
};
```

---

### 3. Create Video Generation Module
**Directory**: `client/src/services/media-generation/video/`

#### 3.1 Types (`types.ts`)
```typescript
import type { LectureScript, VideoConfig as VideoConfigType } from "@/types/types";
import type { MediaProvider } from "../core";

type LectureSegment = LectureScript["segments"][number];

export type VideoGenerationInput = {
  segment: LectureSegment;
  lectureSummary: string;
  segmentIndex: number;
  videoConfig: VideoConfigType;
  runId: string;
};

export type VideoConfig = {
  aspectRatio?: string;
  resolution?: string;
  duration?: string;
  model?: string;
};

export type VideoGenerationParams = {
  prompt: string;
  startingImage: Buffer;
  aspectRatio: string;
  resolution: string;
  duration: number; // in seconds
  model?: string;
};

export interface VideoProvider extends MediaProvider {
  generateVideo(params: VideoGenerationParams): Promise<string | Buffer>;
}

export type VideoPromptGenerationResult = {
  segmentStartImagePrompt: string;
  movieDirections: string;
};
```

#### 3.2 Prompt Generator (`prompt-generator.ts`)
```typescript
import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import {
  createVideoPromptDeveloperPrompt,
  buildPromptForVideoGeneration,
  videoPromptSchema,
} from "@/prompts/create-video-prompt";
import type { LectureScript } from "@/types/types";
import { LLM_MODELS } from "@/lib/models";
import type { VideoPromptGenerationResult } from "./types";

type LectureSegment = LectureScript["segments"][number];

/**
 * Generate video prompts for a single segment using LLM.
 * Returns both image prompt (for starting frame) and movie directions.
 */
export async function generateVideoPrompts(
  segment: LectureSegment,
  lectureSummary: string,
  segmentIndex: number
): Promise<VideoPromptGenerationResult> {
  const userPrompt = buildPromptForVideoGeneration({
    segment,
    lectureSummary,
    segmentIndex,
  });

  const { object } = await generateObject({
    model: openai(LLM_MODELS.GPT_5_MINI),
    system: createVideoPromptDeveloperPrompt,
    prompt: userPrompt,
    schema: videoPromptSchema,
  });

  return {
    segmentStartImagePrompt: object.segment_start_image,
    movieDirections: object.movie_directions,
  };
}
```

#### 3.3 Video Generator (`video-generator.ts`)
```typescript
import { ProviderRegistry } from "../core";
import type { VideoProvider, VideoGenerationParams, VideoConfig } from "./types";
import type { Logger } from "../core";
import { DEFAULT_VIDEO_MODEL } from "@/lib/models";

export const videoProviderRegistry = new ProviderRegistry<VideoProvider>();

/**
 * Pure video generation function.
 * Generates a single video from a prompt, starting image, and configuration.
 * No domain knowledge, no storage, just pure I/O.
 */
export async function generateVideo(
  prompt: string,
  startingImage: Buffer,
  config: VideoConfig,
  options?: {
    provider?: VideoProvider;
    logger?: Logger;
  }
): Promise<Buffer> {
  const { provider: customProvider, logger } = options || {};

  const model = config.model || DEFAULT_VIDEO_MODEL;
  const provider = customProvider || videoProviderRegistry.getProvider(model);

  logger?.info("Generating video", {
    promptPreview: prompt.substring(0, 100) + "...",
    model,
    resolution: config.resolution,
    duration: config.duration,
  });

  const params: VideoGenerationParams = {
    prompt,
    startingImage,
    aspectRatio: config.aspectRatio || "16:9",
    resolution: config.resolution || "480",
    duration: Number.parseInt(config.duration || "10", 10),
    model: config.model,
  };

  const result = await provider.generateVideo(params);

  // Ensure we always return a Buffer
  if (typeof result === "string") {
    const response = await fetch(result);
    if (!response.ok) {
      throw new Error(`Failed to fetch video from URL: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return result;
}
```

#### 3.4 Replicate Provider (`providers/replicate-provider.ts`)
```typescript
import Replicate from "replicate";
import type { VideoProvider, VideoGenerationParams } from "../types";
import { videoModelValues, DEFAULT_VIDEO_MODEL } from "@/lib/models";

/**
 * Replicate video generation provider.
 * Supports models like bytedance/seedance-1-lite.
 */
export class ReplicateVideoProvider implements VideoProvider {
  name = "replicate";
  supportedModels = [...videoModelValues];

  private replicate: Replicate;

  constructor(apiToken?: string) {
    this.replicate = new Replicate({
      auth: apiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateVideo(params: VideoGenerationParams): Promise<Buffer> {
    const { prompt, startingImage, aspectRatio, resolution, duration, model = DEFAULT_VIDEO_MODEL } = params;

    // Convert buffer to base64 for Replicate API
    const imageBase64 = `data:image/jpeg;base64,${startingImage.toString('base64')}`;

    const input = {
      prompt,
      image: imageBase64,
      duration,
      aspect_ratio: aspectRatio || "16:9",
      resolution: resolution || "480",
    };

    const output = (await this.replicate.run(model as `${string}/${string}`, {
      input,
    })) as unknown;

    // Handle output - might be URL or array of URLs
    let videoUrl: string;
    if (Array.isArray(output) && output[0]) {
      videoUrl = output[0] as string;
    } else if (typeof output === 'string') {
      videoUrl = output;
    } else {
      throw new Error(`Video generation failed for prompt: ${prompt.substring(0, 50)}...`);
    }

    // Download the video and return as buffer
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
```

#### 3.5 Index (`index.ts`)
```typescript
export { videoProviderRegistry, generateVideo } from "./video-generator";
export { generateVideoPrompts } from "./prompt-generator";
export { ReplicateVideoProvider } from "./providers/replicate-provider";
export type {
  VideoProvider,
  VideoConfig,
  VideoGenerationParams,
  VideoPromptGenerationResult
} from "./types";
```

---

### 4. Create Video Prompts
**File**: `client/src/prompts/create-video-prompt.ts`

```typescript
import { z } from "zod";
import type { LectureScript } from "@/types/types";
import { buildStyledImagePrompt, type ImageStyleValue } from "@/lib/image-styles";

type LectureSegment = LectureScript["segments"][number];

export const createVideoPromptDeveloperPrompt = `
You are a well-renowned documentary filmmaker. You will be given a narrative for a short 10 second segment in the documentary, as well as the summary of the overall documentary. Your task is to generate:
- An image prompt for the first scene of 10s segment. This image prompts will be used to generate those images and then the image will be fed into a movie generator to generate a movie clip that starts with that image.
- A prompt for the movie generator to help set the mood, camera movements and the cut scenes for the overall 10 second movie. Make sure the cut scenes are separated with [cut] markers. (See example)

# Important Instructions:
- Do not include music or SFX instructions, just video
- Do not include any text generation instructions. No text allowed in the image or movie.
- Ensure that instructions are appropriate for the time period. Example: "city skyline" is not appropriate instruction for 18th century Paris.

# Movie prompt example:
Mood: Energetic, inspiring, and kid-friendly—symbolic action without violence. Colorful, pastel, hand-painted anime look with soft outlines and lively fabric/flag motion.
[cut] Slow dolly-in from a mid shot to a low-angle view of the Bastille. Flags and ribbons flutter in the breeze; sunbeams and dust motes drift. Subtle drumroll builds.
[cut] Quick close-ups—hands passing a rope; a glinting key; a wooden latch clicking; a barrel labeled "Poudre" (gunpowder) in a safe, symbolic way. Rhythm matches snare taps.
[cut] Return to the crowd: they surge forward with hopeful cheers. Doves take off past camera. A parchment ribbon appears briefly with hand-lettered "Change is coming!" as the drumroll resolves into bright strings.
`.trim();

export const videoPromptSchema = z.object({
  segment_start_image: z.string().describe("Prompt describing the starting image for the video segment as determined from the narrative."),
  movie_directions: z.string().describe("Prompt describing the movie generator's directions, including camera moves, style, and cut-scene descriptions."),
});

export type VideoPromptRequest = {
  segment: LectureSegment;
  lectureSummary: string;
  segmentIndex: number;
};

export const buildPromptForVideoGeneration = ({
  segment,
  lectureSummary,
  segmentIndex,
}: VideoPromptRequest) => {
  const narration = segment.narration.trim();

  return `
# Overall Documentary Summary:
${lectureSummary}

# Segment ${segmentIndex + 1} Narrative:
${narration}

Generate the starting image prompt and movie directions for this 10-second segment.
`.trim();
};

/**
 * Apply style to image prompt (used in orchestrator)
 */
export const buildStyledVideoImagePrompt = ({
  basePrompt,
  style,
}: {
  basePrompt: string;
  style?: ImageStyleValue | null;
}) => {
  return buildStyledImagePrompt({ basePrompt, style });
};

/**
 * Apply style to movie directions (used in orchestrator)
 */
export const buildStyledMovieDirections = ({
  baseDirections,
  style,
}: {
  baseDirections: string;
  style?: ImageStyleValue | null;
}) => {
  // Prepend style information to movie directions
  if (!style) return baseDirections;

  const { getImageStyleMetadata } = require("@/lib/image-styles");
  const styleMetadata = getImageStyleMetadata(style);
  if (!styleMetadata) return baseDirections;

  return `Style: ${styleMetadata.description}\n\n${baseDirections}`;
};
```

---

### 5. Create Video Orchestrator (Batched Pipeline)
**File**: `client/src/services/lecture/orchestrators/video-orchestrator.ts`

```typescript
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
          model: imageConfig.model,
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
      co
      logger?.info("Video saved", {
        id: videoId,
        segmentIndex,
        pa

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
```

Update orchestrators index:
**File**: `client/src/services/lecture/orchestrators/index.ts`
```typescript
export { generateLectureImages, regenerateImage } from "./image-orchestrator";
export { generateLectureVideos } from "./video-orchestrator";
// ... other exports
```

---

### 6. Create Inngest Wrapper
**File**: `client/src/inngest/functions/generate-segment-videos.ts`

```typescript
import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { LectureScript, VideoConfig, ImageGenerationDefaults, VideoAsset } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { getLectureById } from "@/data/lecture/repository";
import { setupFileStorage } from "@/lib/storage-utils";
import { videoProviderRegistry, ReplicateVideoProvider } from "@/services/media-generation/video";
import { FileStorageHandler } from "@/services/media-generation/core";
import { generateLectureVideos } from "@/services/lecture/orchestrators";
import { createLectureAssetStorage } from "@/services/lecture/storage";

const inngest = getInngestApp();

// Initialize video provider registry
videoProviderRegistry.register(new ReplicateVideoProvider());

const VIDEO_GENERATION_WORKFLOW_STEP = 4; // Adjust based on workflow
const MAX_VIDEO_SEGMENTS = 5; // Hard limit for video generation

export type GenerateSegmentVideosEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  script: LectureScript;
  lectureSummary: string;
  videoConfig: VideoConfig;
  imageConfig: ImageGenerationDefaults;
  maxVideoSegments: number;
  workflowStep?: number;
  totalWorkflowSteps?: number;
  context?: Record<string, unknown>;
};

export const generateSegmentVideos = inngest.createFunction(
  { id: "generate-segment-videos" },
  { event: "app/generate-segment-videos" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      script,
      lectureSummary,
      videoConfig,
      imageConfig,
      maxVideoSegments,
      workflowStep = VIDEO_GENERATION_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
      context,
    } = event.data as GenerateSegmentVideosEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    // Check if we should skip this step
    const shouldSkip = await step.run("check-existing-videos", async () => {
      const lecture = await getLectureById({ lectureId });
      const hasVideos = lecture?.videos && lecture.videos.length > 0;
      const forceRegenerate = context?.forceRegenerate === true;
      return hasVideos && !forceRegenerate;
    });

    if (shouldSkip) {
      const lecture = await getLectureById({ lectureId });
      await publishStatus("Using existing videos", workflowStep, "complete");
      log.info("Skipping video generation - using existing videos");
      return { runId, videos: lecture!.videos!, skipped: true };
    }

    const segments = script.segments ?? [];
    if (segments.length === 0) {
      const message = "No segments available for video generation";
      log.error(message);
      await publishStatus(message, workflowStep, "error");
      throw new Error(message);
    }

    // Apply hard limit of 5 segments
    const effectiveMaxSegments = Math.min(maxVideoSegments, MAX_VIDEO_SEGMENTS);

    if (effectiveMaxSegments <= 0) {
      const message = "Skipping video generation (maxVideoSegments is zero)";
      log.info(message);
      await publishStatus(message, workflowStep, "complete");
      return { runId, videos: [] as VideoAsset[], skipped: true };
    }

    await step.run("validate-project-access", async () => {
      const project = await getProjectById(projectId, userId);
      if (!project) {
        throw new Error(`Project ${projectId} not found or access denied`);
      }
    });

    const videosToGenerate = Math.min(segments.length, effectiveMaxSegments);

    await publishStatus(
      `Generating ${videosToGenerate} video${videosToGenerate > 1 ? "s" : ""} (batched pipeline)`,
      workflowStep
    );

    const videoAssets = await step.run("generate-lecture-videos", async () => {
      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);

      const assetStorage = createLectureAssetStorage(
        { userId, projectId, lectureId },
        { storageHandler }
      );

      return generateLectureVideos(
        {
          script,
          lectureSummary,
          videoConfig,
          imageConfig,
          maxVideoSegments: videosToGenerate,
          runId,
        },
        {
          userId,
          projectId,
          lectureId,
          maxConcurrency: 5, // Up to 5 concurrent operations per batch
        },
        {
          assetStorage,
          logger: log,
          onPromptProgress: async (current, total) => {
            await publishStatus(
              `Generated prompts for ${current}/${total} segments`,
              workflowStep
            );
          },
          onImageProgress: async (current, total) => {
            await publishStatus(
              `Generated starting image ${current}/${total}`,
              workflowStep
            );
          },
          onVideoProgress: async (current, total) => {
            await publishStatus(
              `Generated video ${current}/${total}`,
              workflowStep
            );
          },
        }
      );
    });

    await publishStatus("Videos generated successfully", workflowStep, "complete");

    log.info("Video generation complete", {
      generatedVideos: videoAssets.length,
      segments: videosToGenerate,
    });

    await step.run("save-generated-videos", async () => {
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { videos: videoAssets },
      });
    });

    return { runId, videos: videoAssets };
  }
);
```

---

### 7. Update Main Workflow
**File**: `client/src/inngest/functions/start-lecture-creation.ts`

Add import:
```typescript
import { generateSegmentVideos } from "@/inngest/functions/generate-segment-videos";
```

Add after image generation (around line 105):
```typescript
// Conditional video generation
if (projectSettings.general.useVideo && projectSettings.general.maxVideoSegments > 0) {
  const lectureBeforeVideos = await step.run("get-lecture-for-videos", async () => {
    return await getLectureById({ lectureId });
  });

  if (!lectureBeforeVideos) {
    throw new Error(`Lecture ${lectureId} not found`);
  }

  const generatedVideos = await step.invoke("generate-segment-videos", {
    function: generateSegmentVideos,
    data: {
      userId,
      runId,
      lectureId,
      projectId: lectureBeforeVideos.projectId,
      script,
      lectureSummary: lectureBeforeVideos.summary || "",
      videoConfig: projectSettings.video,
      imageConfig: projectSettings.image,
      maxVideoSegments: projectSettings.general.maxVideoSegments,
      workflowStep: 4,
      totalWorkflowSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
      context,
    },
  });

  log.info("Video generation complete", {
    generatedVideos: generatedVideos?.videos?.length ?? 0,
  });
}
```

**Important**: Adjust workflow step numbers for subsequent steps:
- Narration: step 5 (was 4)
- Music: step 6 (was 5)
- Timeline: step 7 (was 6)

---

### 8. Testing Strategy

#### 8.1 Create Test File
**File**: `client/src/services/lecture/orchestrators/video-orchestrator.test.ts`

Test scenarios:
- Mock all 3 stages (prompts, images, videos)
- Use `InMemoryStorageHandler` for storage
- Test batch processing flow
- Test style application to prompts
- Test error handling in each stage
- Test maxVideoSegments limiting (max 5)
- Verify concurrent execution within each batch

#### 8.2 Type Checking
Run after each major change:
```bash
pnpm type-check:client
```

---

## Key Design Decisions

### 1. Batched Pipeline Architecture
**Why**: Minimizes overall latency by maximizing parallelization within each stage
- **Stage 1**: Generate all prompts concurrently (fast, LLM calls)
- **Stage 2**: Generate all images concurrently (medium speed)
- **Stage 3**: Generate all videos concurrently (slowest)

**Benefit**: Instead of waiting for each segment to complete all 3 steps sequentially, all segments flow through the pipeline together, reducing total time significantly.

### 2. Hard Limit of 5 Segments
**Why**: Video generation is expensive and time-consuming
- Prevents excessive costs
- Keeps workflow completion time reasonable
- Applied as `Math.min(maxVideoSegments, MAX_VIDEO_SEGMENTS)`

### 3. Style Integration
**Why**: Consistency with existing image generation
- Image prompts get style via `buildStyledImagePrompt()`
- Movie directions get style description prepended
- Uses same style configuration from `imageConfig.style`

### 4. Concurrency = 5
**Why**: Balance between speed and resource usage
- 5 concurrent operations per batch stage
- Can be adjusted based on provider rate limits
- Lower than image generation (which uses 5) due to video complexity

### 5. Storage Pattern
**Why**: Consistency with existing media assets
- Videos: `{basePath}/videos/{videoId}.mp4`
- Starting images: `{basePath}/images/video-img-{runId}-{index}.jpg`
- Same folder structure as other media types

### 6. Resume Support
**Why**: Allows workflow to continue from interruption
- Checks for existing videos before regenerating
- Requires `forceRegenerate: true` in context to override
- Same pattern as image/narration generation

### 7. Progress Callbacks
**Why**: User visibility into long-running process
- 3 separate callbacks for each stage
- Reports progress within each batch
- Integrated with Inngest progress publishing

---

## Performance Characteristics

### Estimated Times (per segment)
- Prompt generation: ~2-5 seconds
- Image generation: ~10-30 seconds
- Video generation: ~60-120 seconds

### Sequential vs Batched (5 segments)
**Sequential** (old approach):
- Segment 1: 2s + 20s + 90s = 112s
- Segment 2: 2s + 20s + 90s = 112s
- Segment 3: 2s + 20s + 90s = 112s
- Segment 4: 2s + 20s + 90s = 112s
- Segment 5: 2s + 20s + 90s = 112s
- **Total: ~560 seconds (9.3 minutes)**

**Batched** (new approach):
- Stage 1 (prompts): 5s (all 5 concurrent)
- Stage 2 (images): 30s (all 5 concurrent)
- Stage 3 (videos): 120s (all 5 concurrent)
- **Total: ~155 seconds (2.6 minutes)**

**Improvement**: ~70% faster with batched pipeline

---

## Files to Create/Modify

### New Files (10 files)
1. `client/src/services/media-generation/video/types.ts`
2. `client/src/services/media-generation/video/video-generator.ts`
3. `client/src/services/media-generation/video/video-generator.test.ts`
4. `client/src/services/media-generation/video/prompt-generator.ts`
5. `client/src/services/media-generation/video/providers/replicate-provider.ts`
6. `client/src/services/media-generation/video/index.ts`
7. `client/src/prompts/create-video-prompt.ts`
8. `client/src/services/lecture/orchestrators/video-orchestrator.ts`
9. `client/src/services/lecture/orchestrators/video-orchestrator.test.ts`
10. `client/src/inngest/functions/generate-segment-videos.ts`

### Modified Files (4 files)
1. `client/src/types/types.ts` - Add videoAssetSchema
2. `client/src/services/lecture/storage/lecture-asset-storage.ts` - Add video methods
3. `client/src/services/lecture/orchestrators/index.ts` - Export video orchestrator
4. `client/src/inngest/functions/start-lecture-creation.ts` - Add video generation step

---

## Summary

This implementation adds video generation using a highly optimized batched pipeline approach that maximizes concurrency and minimizes overall latency. The 3-stage pipeline (prompts → images → videos) processes all segments in parallel within each stage, resulting in approximately 70% time savings compared to sequential processing.

Key features:
- ✅ Batched pipeline with 3 concurrent stages
- ✅ Max 5 segments (hard limit)
- ✅ Style integration from image config
- ✅ Replicate provider with bytedance/seedance-1-lite
- ✅ Resume support
- ✅ Progress tracking for each stage
- ✅ Testable architecture with dependency injection
- ✅ Consistent with existing patterns
