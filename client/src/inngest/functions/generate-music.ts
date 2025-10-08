import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { LectureScript } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { setupFileStorage } from "@/lib/storage-utils";
import { musicProviderRegistry, ReplicateMusicProvider } from "@/services/media-generation/music";
import { FileStorageHandler } from "@/services/media-generation/core";
import { generateLectureMusic } from "@/services/lecture/orchestrators";

const inngest = getInngestApp();

// Initialize music provider registry
musicProviderRegistry.register(new ReplicateMusicProvider());

const MUSIC_GENERATION_WORKFLOW_STEP = 6;

export type GenerateMusicEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  script: LectureScript;
  durationSeconds: number;
  workflowStep?: number;
  totalWorkflowSteps?: number;
};

export const generateMusic = inngest.createFunction(
  { id: "generate-music" },
  { event: "app/generate-music" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      script,
      durationSeconds,
      workflowStep = MUSIC_GENERATION_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
    } = event.data as GenerateMusicEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    const segments = script?.segments ?? [];
    if (segments.length === 0) {
      const message = "No script segments available for music generation";
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

    await publishStatus("Generating music", workflowStep);

    const musicAsset = await step.run("generate-music", async () => {
      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);

      return generateLectureMusic(
        {
          script,
          durationSeconds,
          runId,
        },
        {
          userId,
          projectId,
        },
        {
          saveFile: async (buffer, path) => {
            await storageHandler.saveFile(buffer, path);
          },
          logger: log,
        }
      );
    });

    await publishStatus("Background music generated successfully", workflowStep, "complete");

    log.info("Music generation complete", {
      audioUrl: musicAsset.audioUrl,
    });

    await step.run("save-music-metadata", async () => {
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: {
          music: [musicAsset],
        },
      });
    });

    return {
      runId,
      music: musicAsset,
    };
  }
);