import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { LectureScript, ImageGenerationDefaults, ImageAsset } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { setupFileStorage } from "@/lib/storage-utils";
import { imageProviderRegistry, ReplicateImageProvider } from "@/services/media-generation/image";
import { FileStorageHandler } from "@/services/media-generation/core";
import { generateLectureImages } from "@/services/lecture/orchestrators";

const inngest = getInngestApp();

// Initialize image provider registry
imageProviderRegistry.register(new ReplicateImageProvider());

const MAX_IMAGE_SEGMENT_PROMPT_CALLS = Number.parseInt(
  process.env.MAX_IMAGE_SEGMENT_PROMPT_CALLS ?? "3",
  10
);

const IMAGE_GENERATION_WORKFLOW_STEP = 3;

export type GenerateSegmentImagesEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  script: LectureScript;
  imageDefaults: ImageGenerationDefaults;
  workflowStep?: number;
  totalWorkflowSteps?: number;
};

export const generateSegmentImages = inngest.createFunction(
  { id: "generate-segment-images" },
  { event: "app/generate-segment-images" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      script,
      imageDefaults,
      workflowStep = IMAGE_GENERATION_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
    } = event.data as GenerateSegmentImagesEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    const segments = script.segments ?? [];
    if (segments.length === 0) {
      const message = "No segments available for image generation";
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

    const limit = Math.min(segments.length, MAX_IMAGE_SEGMENT_PROMPT_CALLS);

    if (limit <= 0) {
      const message = "Skipping image generation (limit is zero)";
      log.info(message, { limit });
      await publishStatus(message, workflowStep, "complete");
      return { runId, images: [] as ImageAsset[], skipped: true };
    }

    // Limit segments to process
    const limitedScript: LectureScript = {
      ...script,
      segments: script.segments?.slice(0, limit) || [],
    };

    const imagesPerSegment = imageDefaults.imagesPerSegment ?? 1;
    const totalImages = limitedScript.segments.length * imagesPerSegment;

    await publishStatus(
      `Generating ${totalImages} image${totalImages > 1 ? "s" : ""} for ${limitedScript.segments.length} segment${limitedScript.segments.length === 1 ? "" : "s"}`,
      workflowStep
    );

    const flattenedImages = await step.run("generate-lecture-images", async () => {
      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);

      return generateLectureImages(
        {
          script: limitedScript,
          config: imageDefaults,
          runId,
        },
        {
          userId,
          projectId,
          maxConcurrency: 5,
        },
        {
          saveFile: async (buffer, path) => {
            await storageHandler.saveFile(buffer, path);
          },
          logger: log,
        }
      );
    });

    await publishStatus("Images generated successfully", workflowStep, "complete");

    log.info("Image generation complete", {
      generatedImages: flattenedImages.length,
      segments: limitedScript.segments.length,
    });

    await step.run("save-generated-images", async () => {
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { images: flattenedImages },
      });
    });

    return { runId, images: flattenedImages };
  }
);
