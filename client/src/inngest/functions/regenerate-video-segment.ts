import { Buffer } from "node:buffer";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
} from "@/inngest/functions/workflow-utils";
import { getLectureById } from "@/data/lecture/repository";
import { getProjectById } from "@/data/project";
import { createWorkflowRun, updateWorkflowRun } from "@/data/workflow-runs";
import { setupFileStorage } from "@/lib/storage-utils";
import { FileStorageHandler } from "@/services/media-generation/core";
import { createLectureAssetStorage } from "@/services/lecture/storage";
import { updateLectureContent } from "@/services/lecture/persist";
import { videoProviderRegistry, ReplicateVideoProvider } from "@/services/media-generation/video";
import { generateVideo } from "@/services/media-generation/video/video-generator";
import { buildStyledMovieDirections } from "@/prompts/create-video-prompt";
import type { LectureConfig, VideoAsset } from "@/types/types";
import { DEFAULT_IMAGE_GENERATION_DEFAULTS, videoResolutionValues } from "@/types/types";
import { DEFAULT_VIDEO_MODEL } from "@/lib/models";

const inngest = getInngestApp();

videoProviderRegistry.register(new ReplicateVideoProvider());

export type RegenerateVideoSegmentEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  videoAssetId: string;
  movieDirections: string;
  model?: string;
  config: LectureConfig;
};

const SINGLE_STEP = 1;

const ensureResolution = (
  value: string | undefined,
  fallback: (typeof videoResolutionValues)[number]
): (typeof videoResolutionValues)[number] => {
  if (!value) {
    return fallback;
  }
  return videoResolutionValues.includes(value as (typeof videoResolutionValues)[number])
    ? (value as (typeof videoResolutionValues)[number])
    : fallback;
};

const toDurationSeconds = (value?: number | string): number => {
  if (typeof value === "number" && !Number.isNaN(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 10;
};

const stripApiPrefix = (url: string) => {
  const withoutOrigin = url.replace(/^https?:\/\/[^/]+\//, "");
  return withoutOrigin.replace(/^\/?api\/storage\//, "");
};

const normalizeToBuffer = (data: unknown): Buffer => {
  if (Buffer.isBuffer(data)) {
    return data;
  }

  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }

  if (
    typeof data === "object" &&
    data !== null &&
    "type" in data &&
    (data as { type: unknown }).type === "Buffer" &&
    "data" in data &&
    Array.isArray((data as { data: unknown }).data)
  ) {
    return Buffer.from((data as { data: number[] }).data);
  }

  throw new Error("Received unsupported buffer format from storage");
};

export const regenerateVideoSegment = inngest.createFunction(
  { id: "regenerate-video-segment" },
  { event: "app/regenerate-video-segment" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      videoAssetId,
      movieDirections,
      model,
      config,
    } = event.data as RegenerateVideoSegmentEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus, publishVideoPreview, publishVideoComplete } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: SINGLE_STEP,
      log,
    });

    await step.run("create-workflow-run", async () => {
      await createWorkflowRun({
        runId,
        lectureId,
        userId,
        totalSteps: SINGLE_STEP,
        status: "running",
        currentStep: 0,
      });
    });

    const lecture = await step.run("load-lecture", async () => {
      const snapshot = await getLectureById({ lectureId });
      if (!snapshot) {
        throw new Error("Lecture not found");
      }
      const existingVideo = snapshot.videos?.find((video) => video.id === videoAssetId);
      if (!existingVideo) {
        throw new Error(`Video asset ${videoAssetId} not found`);
      }
      return snapshot;
    });

    const existingVideo = lecture.videos!.find((video) => video.id === videoAssetId)!;

    await step.run("validate-project-access", async () => {
      const project = await getProjectById(projectId, userId);
      if (!project) {
        throw new Error(`Project ${projectId} not found or access denied`);
      }
    });

    await publishStatus("Preparing video regeneration", 0);

    const storage = setupFileStorage();
    const storageHandler = new FileStorageHandler(storage);
    const assetStorage = createLectureAssetStorage(
      { userId, projectId, lectureId },
      { storageHandler }
    );

    const selectedMovieDirections =
      movieDirections && movieDirections.trim().length > 0
        ? movieDirections
        : existingVideo.movieDirections;

    if (!selectedMovieDirections || selectedMovieDirections.trim().length === 0) {
      const message = "Cannot regenerate video without movie directions.";
      await publishStatus(message, 0, "error");
      throw new Error(message);
    }

    const selectedModel =
      model ??
      config.video?.model ??
      existingVideo.model ??
      DEFAULT_VIDEO_MODEL;

    const selectedResolution = ensureResolution(
      config.video?.resolution ?? existingVideo.resolution,
      videoResolutionValues[0]
    );

    const selectedDurationSeconds = toDurationSeconds(
      existingVideo.duration ?? config.video?.duration
    );

    const selectedAspectRatio =
      existingVideo.aspectRatio ??
      config.image?.aspectRatio ??
      DEFAULT_IMAGE_GENERATION_DEFAULTS.aspectRatio;

    const startingImageId = existingVideo.startingImageId;
    const legacyStartingImageUrl = (existingVideo as { startingImageUrl?: string }).startingImageUrl;

    const startingImageData = await step.run("load-starting-image", async () => {
      if (startingImageId) {
        const imagePath = assetStorage.resolveImagePath(startingImageId);
        const exists = await storage.fileExists(imagePath);
        if (!exists) {
          const message = "Starting image file is missing for this video. Please regenerate the starting image first.";
          await publishStatus(message, 0, "error");
          throw new Error(message);
        }
        return storage.readToBuffer(imagePath);
      }

      if (legacyStartingImageUrl) {
        const relative = stripApiPrefix(legacyStartingImageUrl);
        const exists = await storage.fileExists(relative);
        if (!exists) {
          const message = "Starting image file is missing for this video. Please regenerate the starting image first.";
          await publishStatus(message, 0, "error");
          throw new Error(message);
        }
        return storage.readToBuffer(relative);
      }

      const message = "No starting image available for this video. Regenerate the starting image to continue.";
      await publishStatus(message, 0, "error");
      throw new Error(message);
    });

    const startingImageBuffer = normalizeToBuffer(startingImageData);

    await publishStatus("Generating replacement video", 0);

    const styledDirections = buildStyledMovieDirections({
      baseDirections: selectedMovieDirections,
      style: config.image?.style ?? DEFAULT_IMAGE_GENERATION_DEFAULTS.style,
    });

    const generatedVideo = await step.run("generate-video", async () => {
      const videoBuffer = await generateVideo(
        styledDirections,
        startingImageBuffer,
        {
          aspectRatio: selectedAspectRatio,
          resolution: selectedResolution,
          duration: String(selectedDurationSeconds),
          model: selectedModel,
        },
        { logger: log }
      );

      const savedPath = await assetStorage.saveVideo(videoBuffer, videoAssetId);
      log.info("Video regenerated", {
        videoAssetId,
        path: savedPath,
        model: selectedModel,
        resolution: selectedResolution,
        durationSeconds: selectedDurationSeconds,
      });

      return {
        path: savedPath,
        durationSeconds: selectedDurationSeconds,
        resolution: selectedResolution,
      };
    });

    const previewAsset: Partial<VideoAsset> & { id: string } = {
      id: videoAssetId,
      label: existingVideo.label,
      segmentStartImagePrompt: existingVideo.segmentStartImagePrompt,
      movieDirections: selectedMovieDirections,
      model: selectedModel,
      resolution: generatedVideo.resolution,
      duration: generatedVideo.durationSeconds,
      aspectRatio: selectedAspectRatio,
      startingImageId: existingVideo.startingImageId,
      startingImageModel: existingVideo.startingImageModel,
      videoPath: generatedVideo.path,
    };

    await step.run("publish-preview", async () => {
      await publishVideoPreview(videoAssetId, previewAsset as VideoAsset);
      await publishStatus("Video ready for review", 0, "complete");
    });

    const acceptancePromise = step
      .waitForEvent("wait-video-accepted", {
        event: "app/video.accepted",
        timeout: "30m",
        match: "data.runId",
      })
      .then((evt) => (evt ? { type: "accepted" as const } : { type: "timeout" as const }));

    const rejectionPromise = step
      .waitForEvent("wait-video-rejected", {
        event: "app/video.rejected",
        timeout: "30m",
        match: "data.runId",
      })
      .then((evt) => (evt ? { type: "rejected" as const } : { type: "timeout" as const }));

    const outcome = await Promise.race([acceptancePromise, rejectionPromise]);

    if (outcome.type === "timeout") {
      const message = "Video review timed out.";
      await publishStatus(message, 0, "error");
      throw new Error(message);
    }

    if (outcome.type === "rejected") {
      log.info("Video regeneration rejected by user", { videoAssetId });
      await publishStatus("Video regeneration rejected", 0, "complete");
      await step.run("mark-run-rejected", async () => {
        await updateWorkflowRun({
          runId,
          status: "succeeded",
          currentStep: SINGLE_STEP,
          context: { reviewOutcome: "rejected" },
        });
      });
      return { runId, videoAssetId, rejected: true };
    }

    log.info("Video regeneration accepted", { videoAssetId });

    await step.run("update-lecture", async () => {
      const latest = await getLectureById({ lectureId });
      if (!latest) {
        throw new Error("Lecture not found during persistence");
      }

      const updatedVideos = (latest.videos ?? []).map((video) =>
        video.id === videoAssetId
          ? {
              ...video,
              movieDirections: selectedMovieDirections,
              model: selectedModel,
              resolution: generatedVideo.resolution,
              duration: generatedVideo.durationSeconds,
              aspectRatio: selectedAspectRatio,
              videoPath: generatedVideo.path,
            }
          : video
      );

      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { videos: updatedVideos as VideoAsset[] },
      });
    });

    await step.run("publish-complete", async () => {
      await publishVideoComplete(lectureId, videoAssetId);
    });

    await step.run("mark-run-complete", async () => {
      await updateWorkflowRun({
        runId,
        status: "succeeded",
        currentStep: SINGLE_STEP,
      });
    });

    await publishStatus("Video regeneration complete", 0, "complete");

    return { runId, videoAssetId, updated: true };
  }
);
