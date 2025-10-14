import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
} from "@/inngest/functions/workflow-utils";
import type { ImageAsset, LectureConfig } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { getLectureById } from "@/data/lecture/repository";
import { setupFileStorage } from "@/lib/storage-utils";
import { imageProviderRegistry, ReplicateImageProvider } from "@/services/media-generation/image";
import { FileStorageHandler } from "@/services/media-generation/core";
import { regenerateImage } from "@/services/lecture/orchestrators";
import { createWorkflowRun, updateWorkflowRun } from "@/data/workflow-runs";
import { createLectureAssetStorage } from "@/services/lecture/storage";

const inngest = getInngestApp();

// Initialize image provider registry
imageProviderRegistry.register(new ReplicateImageProvider());

export type RegenerateSingleImageEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  imageAssetId: string;
  prompt: string;
  model?: string;
  config: LectureConfig;
};

export const regenerateSingleImage = inngest.createFunction(
  { id: "regenerate-single-image" },
  { event: "app/regenerate-single-image" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      imageAssetId,
      prompt,
      model,
      config,
    } = event.data as RegenerateSingleImageEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus, publishImagePreview, publishImageComplete } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: 1,
      log,
    });

    // Step 1: Create workflow run for persistence
    await step.run("create-workflow-run", async () => {
      await createWorkflowRun({
        runId,
        lectureId,
        userId,
        totalSteps: 1,
        status: "running",
        currentStep: 0,
      });
    });

    // Step 2: Validate project access
    await step.run("validate-project-access", async () => {
      const project = await getProjectById(projectId, userId);
      if (!project) {
        throw new Error(`Project ${projectId} not found or access denied`);
      }
    });

    await publishStatus("Starting image generation", 0);

    // Step 3: Generate single image
    const generatedImage = await step.run("generate-single-image", async () => {
      log.info("Generating single image", { prompt, model, imageAssetId });
      await publishStatus("Generating image with AI", 0);

      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);

      const imageDefaults = {
        width: 1024,
        height: 576,
        aspectRatio: config.image?.aspectRatio || "16:9",
        size: config.image?.size || "1080",
        style: config.image?.style,
      };

      // If model is specified, override the config
      if (model) {
        imageDefaults.style = model as any;
      }

      const assetStorage = createLectureAssetStorage(
        { userId, projectId, lectureId },
        { storageHandler }
      );

      const image = await regenerateImage(
        {
          prompt,
          config: imageDefaults,
          imageId: imageAssetId, // Use existing ID to maintain references
        },
        {
          userId,
          projectId,
          lectureId,
        },
        {
          assetStorage,
          logger: log,
        }
      );

      log.info("Image generated successfully", { imageId: image.id });
      return image;
    });

    // Step 4: Publish image preview for human review
    await step.run("publish-image-preview", async () => {
      await publishImagePreview(imageAssetId, generatedImage);
      await publishStatus("Image ready for review", 0, "complete");
      log.info("Image preview published - waiting for user acceptance");
    });

    // Step 5: Wait for user decision
    const acceptancePromise = step
      .waitForEvent("wait-for-image-acceptance", {
        event: "app/image.accepted",
        timeout: "30m",
        match: "data.runId",
      })
      .then((event) =>
        event
          ? { type: "accepted" as const, event }
          : { type: "timeout" as const, event: null }
      );

    const rejectionPromise = step
      .waitForEvent("wait-for-image-rejection", {
        event: "app/image.rejected",
        timeout: "30m",
        match: "data.runId",
      })
      .then((event) =>
        event
          ? { type: "rejected" as const, event }
          : { type: "timeout" as const, event: null }
      );

    const reviewOutcome = await Promise.race([acceptancePromise, rejectionPromise]);

    if (reviewOutcome.type === "timeout") {
      throw new Error("Image review timeout");
    }

    if (reviewOutcome.type === "rejected") {
      log.info("Image rejected by user");
      await publishStatus("Image rejected by user. Discarding preview.", 0, "complete");

      await step.run("mark-workflow-rejected", async () => {
        await updateWorkflowRun({
          runId,
          status: "succeeded",
          currentStep: 1,
          context: { reviewOutcome: "rejected" },
        });
      });

      return { runId, imageAssetId, imageAsset: generatedImage, rejected: true };
    }

    log.info("Image accepted by user");

    // Step 6: Replace image in lecture's images array
    await step.run("save-accepted-image", async () => {
      await publishStatus("Saving accepted image", 0);

      const lecture = await getLectureById({ lectureId });
      if (!lecture) {
        throw new Error("Lecture not found");
      }

      // Find and replace the image with the same ID
      const updatedImages = (lecture.images || []).map((img) =>
        img.id === imageAssetId
          ? {
              id: imageAssetId, // Keep the same ID
              prompt, // Update with new prompt
              model: model || img.model || generatedImage.model, // Update model if provided
              sourceUrl: generatedImage.sourceUrl,
              aspectRatio: generatedImage.aspectRatio,
              width: generatedImage.width,
              height: generatedImage.height,
              size: generatedImage.size,
              label: generatedImage.label,
            }
          : img
      );

      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { images: updatedImages },
      });

      log.info("Image saved successfully", { imageAssetId });
    });

    // Step 7: Publish image completion to trigger UI refresh
    await step.run("publish-image-completion", async () => {
      await publishImageComplete(lectureId, imageAssetId);
      log.info("Image completion event published");
    });

    // Step 8: Mark workflow as complete
    await step.run("mark-workflow-complete", async () => {
      await updateWorkflowRun({
        runId,
        status: "succeeded",
        currentStep: 1,
      });
    });

    await publishStatus("Image regeneration complete", 0, "complete");

    return { runId, imageAssetId, imageAsset: generatedImage };
  }
);
