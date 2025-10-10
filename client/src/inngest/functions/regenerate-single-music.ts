import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
} from "@/inngest/functions/workflow-utils";
import type { MusicSettings, LectureConfig } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { getLectureById } from "@/data/lecture/repository";
import { setupFileStorage } from "@/lib/storage-utils";
import { musicProviderRegistry, ReplicateMusicProvider } from "@/services/media-generation/music";
import { FileStorageHandler } from "@/services/media-generation/core";
import { regenerateMusic } from "@/services/lecture/orchestrators";
import { createWorkflowRun, updateWorkflowRun } from "@/data/workflow-runs";

const inngest = getInngestApp();

// Initialize music provider registry
musicProviderRegistry.register(new ReplicateMusicProvider());

export type RegenerateSingleMusicEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  musicAssetId: string;
  prompt: string;
  durationSeconds: number;
  model?: string;
  config: LectureConfig;
};

export const regenerateSingleMusic = inngest.createFunction(
  { id: "regenerate-single-music" },
  { event: "app/regenerate-single-music" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      musicAssetId,
      prompt,
      durationSeconds,
      model,
      config,
    } = event.data as RegenerateSingleMusicEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus, publishMusicPreview, publishMusicComplete } = createLectureProgressPublisher({
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

    await publishStatus("Starting music generation", 0);

    // Step 3: Generate single music track
    const generatedMusic = await step.run("generate-single-music", async () => {
      log.info("Generating single music track", { prompt, model, durationSeconds, musicAssetId });
      await publishStatus("Generating music with AI", 0);

      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);

      const music = await regenerateMusic(
        {
          prompt,
          durationSeconds,
          model,
          musicId: musicAssetId, // Use existing ID to maintain references
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

      log.info("Music generated successfully", { musicId: music.id });
      return music;
    });

    // Step 4: Publish music preview for human review
    await step.run("publish-music-preview", async () => {
      await publishMusicPreview(musicAssetId, generatedMusic);
      await publishStatus("Music ready for review", 0, "complete");
      log.info("Music preview published - waiting for user acceptance");
    });

    // Step 5: Wait for user acceptance
    const acceptanceEvent = await step.waitForEvent("wait-for-music-acceptance", {
      event: "app/music.accepted",
      timeout: "30m",
      match: "data.runId",
    });

    if (!acceptanceEvent) {
      throw new Error("Music acceptance timeout");
    }

    log.info("Music accepted by user");

    // Step 6: Replace music in lecture's music array
    await step.run("save-accepted-music", async () => {
      await publishStatus("Saving accepted music", 0);

      const lecture = await getLectureById({ lectureId });
      if (!lecture) {
        throw new Error("Lecture not found");
      }

      // Find and replace the music with the same ID
      const updatedMusic = (lecture.music || []).map((mus) =>
        mus.id === musicAssetId
          ? {
              id: musicAssetId, // Keep the same ID
              prompt, // Update with new prompt
              type: model || mus.type || generatedMusic.type, // Update model/type if provided
              audioUrl: generatedMusic.audioUrl,
              durationSeconds: generatedMusic.durationSeconds,
            }
          : mus
      );

      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { music: updatedMusic },
      });

      log.info("Music saved successfully", { musicAssetId });
    });

    // Step 7: Publish music completion to trigger UI refresh
    await step.run("publish-music-completion", async () => {
      await publishMusicComplete(lectureId, musicAssetId);
      log.info("Music completion event published");
    });

    // Step 8: Mark workflow as complete
    await step.run("mark-workflow-complete", async () => {
      await updateWorkflowRun({
        runId,
        status: "succeeded",
        currentStep: 1,
      });
    });

    await publishStatus("Music regeneration complete", 0, "complete");

    return { runId, musicAssetId, musicAsset: generatedMusic };
  }
);
