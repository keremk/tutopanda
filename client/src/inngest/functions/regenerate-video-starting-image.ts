import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
} from "@/inngest/functions/workflow-utils";
import type { LectureConfig, VideoAsset } from "@/types/types";
import { getLectureById } from "@/data/lecture/repository";
import { getProjectById } from "@/data/project";
import { createWorkflowRun, updateWorkflowRun } from "@/data/workflow-runs";
import { setupFileStorage } from "@/lib/storage-utils";
import { FileStorageHandler } from "@/services/media-generation/core";
import { createLectureAssetStorage } from "@/services/lecture/storage";
import { imageProviderRegistry, ReplicateImageProvider } from "@/services/media-generation/image";
import { generateImage } from "@/services/media-generation/image/image-generator";
import { buildStyledVideoImagePrompt } from "@/prompts/create-video-prompt";
import { DEFAULT_IMAGE_MODEL } from "@/lib/models";
import { updateLectureContent } from "@/services/lecture/persist";
import { DEFAULT_IMAGE_GENERATION_DEFAULTS } from "@/types/types";

const inngest = getInngestApp();

imageProviderRegistry.register(new ReplicateImageProvider());

export type RegenerateVideoStartingImageEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  videoAssetId: string;
  segmentStartImagePrompt: string;
  imageModel?: string;
  config: LectureConfig;
};

const SINGLE_STEP = 1;

export const regenerateVideoStartingImage = inngest.createFunction(
  { id: "regenerate-video-starting-image" },
  { event: "app/regenerate-video-starting-image" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      videoAssetId,
      segmentStartImagePrompt,
      imageModel,
      config,
    } = event.data as RegenerateVideoStartingImageEvent;

    const log = createLectureLogger(runId, logger);
    const {
      publishStatus,
      publishVideoImagePreview,
      publishVideoImageComplete,
    } = createLectureProgressPublisher({
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
      const loaded = await getLectureById({ lectureId });
      if (!loaded) {
        throw new Error("Lecture not found");
      }
      const hasVideo = loaded.videos?.some((video) => video.id === videoAssetId);
      if (!hasVideo) {
        throw new Error(`Video asset ${videoAssetId} not found`);
      }
      return loaded;
    });

    await step.run("validate-project-access", async () => {
      const project = await getProjectById(projectId, userId);
      if (!project) {
        throw new Error(`Project ${projectId} not found or access denied`);
      }
    });

    await publishStatus("Generating starting image", 0);

    const existingVideo = lecture.videos!.find((video) => video.id === videoAssetId)!;
    const targetImageId = existingVideo.startingImageId ?? `video-img-${runId}-0`;

    const selectedImageModel =
      imageModel ??
      config.video?.imageModel ??
      config.image?.model ??
      existingVideo.startingImageModel ??
      DEFAULT_IMAGE_MODEL;

    const baseDefaults = DEFAULT_IMAGE_GENERATION_DEFAULTS;
    const imageDefaults = {
      width: baseDefaults.width,
      height: baseDefaults.height,
      aspectRatio: config.image?.aspectRatio ?? baseDefaults.aspectRatio,
      size: config.image?.size ?? baseDefaults.size,
      style: config.image?.style ?? baseDefaults.style,
      model: selectedImageModel,
    } as const;

    const styledPrompt = buildStyledVideoImagePrompt({
      basePrompt: segmentStartImagePrompt,
      style: imageDefaults.style,
      model: selectedImageModel,
    });

    const generatedInfo = await step.run("generate-starting-image", async () => {
      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);
      const assetStorage = createLectureAssetStorage(
        { userId, projectId, lectureId },
        { storageHandler }
      );

      const buffer = await generateImage(styledPrompt, {
        aspectRatio: imageDefaults.aspectRatio,
        size: imageDefaults.size,
        width: imageDefaults.width,
        height: imageDefaults.height,
        model: selectedImageModel,
      });

      const imagePath = await assetStorage.saveImage(buffer, targetImageId);

      log.info("Starting image regenerated", {
        videoAssetId,
        imageId: targetImageId,
        path: imagePath,
        model: selectedImageModel,
      });

      return {
        segmentStartImagePrompt,
        startingImageModel: selectedImageModel,
        startingImageId: targetImageId,
        videoPath:
          existingVideo.videoPath ?? `${userId}/${projectId}/${lectureId}/videos/${existingVideo.id}.mp4`,
      };
    });

    const previewAsset: Partial<VideoAsset> & { id: string } = {
      id: videoAssetId,
      label: existingVideo.label,
      model: existingVideo.model,
      resolution: existingVideo.resolution,
      duration: existingVideo.duration,
      aspectRatio: existingVideo.aspectRatio,
      segmentStartImagePrompt: generatedInfo.segmentStartImagePrompt,
      startingImageModel: generatedInfo.startingImageModel,
      startingImageId: generatedInfo.startingImageId,
      videoPath: generatedInfo.videoPath,
    };

    await step.run("publish-preview", async () => {
      await publishVideoImagePreview(videoAssetId, previewAsset as VideoAsset);
      await publishStatus("Starting image ready for review", 0, "complete");
    });

    const acceptancePromise = step
      .waitForEvent("wait-video-image-accepted", {
        event: "app/video-image.accepted",
        timeout: "30m",
        match: "data.runId",
      })
      .then((evt) => (evt ? { type: "accepted" as const } : { type: "timeout" as const }));

    const rejectionPromise = step
      .waitForEvent("wait-video-image-rejected", {
        event: "app/video-image.rejected",
        timeout: "30m",
        match: "data.runId",
      })
      .then((evt) => (evt ? { type: "rejected" as const } : { type: "timeout" as const }));

    const outcome = await Promise.race([acceptancePromise, rejectionPromise]);

    if (outcome.type === "timeout") {
      throw new Error("Starting image review timed out");
    }

    if (outcome.type === "rejected") {
      log.info("Starting image rejected by user", { videoAssetId });
      await publishStatus("Starting image rejected", 0, "complete");
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

    log.info("Starting image accepted", { videoAssetId });

    await step.run("update-lecture", async () => {
      const latest = await getLectureById({ lectureId });
      if (!latest) {
        throw new Error("Lecture not found during update");
      }

      const updatedVideos = (latest.videos ?? []).map((video) =>
        video.id === videoAssetId
          ? {
              ...video,
              segmentStartImagePrompt: generatedInfo.segmentStartImagePrompt,
              startingImageModel: generatedInfo.startingImageModel,
              startingImageId: generatedInfo.startingImageId,
              videoPath: generatedInfo.videoPath,
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
      await publishVideoImageComplete(lectureId, videoAssetId);
    });

    await step.run("mark-run-complete", async () => {
      await updateWorkflowRun({
        runId,
        status: "succeeded",
        currentStep: SINGLE_STEP,
      });
    });

    await publishStatus("Starting image regeneration complete", 0, "complete");

    return { runId, videoAssetId, updated: true };
  }
);
