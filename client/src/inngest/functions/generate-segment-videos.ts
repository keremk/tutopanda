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
import {
  generateVideoAssets,
  generateVideoSegmentPrompts,
  generateVideoStartingImages,
} from "@/services/lecture/orchestrators/video-orchestrator";
import { createLectureAssetStorage } from "@/services/lecture/storage";

const inngest = getInngestApp();

// Initialize video provider registry
videoProviderRegistry.register(new ReplicateVideoProvider());

const MAX_VIDEO_GENERATION_CALLS = Number.parseInt(
  process.env.MAX_VIDEO_GENERATION_CALLS ?? "1",
  10
);

const VIDEO_GENERATION_WORKFLOW_STEP = 4;

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

    // Apply development limit from environment
    const effectiveMaxSegments = Math.min(maxVideoSegments, MAX_VIDEO_GENERATION_CALLS);

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
    const limitedSegments = segments.slice(0, videosToGenerate);

    const storage = setupFileStorage();
    const storageHandler = new FileStorageHandler(storage);

    const assetStorage = createLectureAssetStorage(
      { userId, projectId, lectureId },
      { storageHandler }
    );

    const maxConcurrency = 5;

    await publishStatus(
      `Generating prompts for ${limitedSegments.length} segment${limitedSegments.length === 1 ? "" : "s"}`,
      workflowStep
    );

    const segmentPrompts = await step.run("generate-video-prompts", async () => {
      return generateVideoSegmentPrompts(limitedSegments, {
        style: imageConfig.style,
        lectureSummary,
        maxConcurrency,
        logger: log,
        imageModel: imageConfig.model,
        onPromptProgress: async (current, total) => {
          await publishStatus(
            `Generated prompts for ${current}/${total} segments`,
            workflowStep
          );
        },
      });
    });

    await publishStatus("Generating starting images", workflowStep);

    const segmentImages = await step.run("generate-starting-images", async () => {
      return generateVideoStartingImages(segmentPrompts, {
        imageConfig,
        runId,
        assetStorage,
        maxConcurrency,
        logger: log,
        onImageProgress: async (current, total) => {
          await publishStatus(
            `Generated starting image ${current}/${total}`,
            workflowStep
          );
        },
      });
    });

    await publishStatus("Generating segment videos", workflowStep);

    const videoAssets = await step.run("generate-video-assets", async () => {
      return generateVideoAssets(segmentPrompts, segmentImages, {
        videoConfig,
        imageConfig,
        runId,
        assetStorage,
        maxConcurrency,
        logger: log,
        onVideoProgress: async (current, total) => {
          await publishStatus(
            `Generated video ${current}/${total}`,
            workflowStep
          );
        },
        loadImageFn: async (imagePath) => storage.readToBuffer(imagePath),
      });
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
