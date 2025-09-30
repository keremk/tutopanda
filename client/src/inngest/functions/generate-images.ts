import Replicate from "replicate";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { ImageAsset } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { setupFileStorage, saveFileToStorage } from "@/lib/storage-utils";

const inngest = getInngestApp();
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const IMAGE_GENERATION_WORKFLOW_STEP = 4;

export type GenerateImagesEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  images: ImageAsset[];
  workflowStep?: number;
  totalWorkflowSteps?: number;
};


export const generateImages = inngest.createFunction(
  { id: "generate-images" },
  { event: "app/generate-images" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      images,
      workflowStep = IMAGE_GENERATION_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
    } = event.data as GenerateImagesEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    if (!images || images.length === 0) {
      const message = "No images available for generation";
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

    await publishStatus(
      `Generating ${images.length} image${images.length === 1 ? "" : "s"}`,
      workflowStep
    );

    const updatedImages = await Promise.all(
      images.map((imageAsset, index) =>
        step.run(`generate-image-${index}`, async () => {
          const imagePosition = index + 1;

          log.info("Generating image", {
            imageId: imageAsset.id,
            position: imagePosition,
            prompt: imageAsset.prompt.substring(0, 100) + "...", 
            height: imageAsset.height,
            width: imageAsset.width,
            size: imageAsset.size,
          });

          if (!imageAsset.prompt) {
            throw new Error(`Image ${imageAsset.id} has no prompt`);
          }

          const input = {
            size: imageAsset.size || "1K",
            // width: imageAsset.width || 1024,
            // height: imageAsset.height || 576,
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

          await publishStatus(
            `Image ${imagePosition}/${images.length} generated`,
            workflowStep
          );

          return {
            ...imageAsset,
            sourceUrl: filePath,
          } satisfies ImageAsset;
        })
      )
    );

    await publishStatus("Images generated successfully", workflowStep, "complete");

    log.info("Image generation complete", {
      generatedImages: updatedImages.length,
    });

    await step.run("save-generated-images", async () => {
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { images: updatedImages },
      });
    });

    return { runId, images: updatedImages };
  }
);