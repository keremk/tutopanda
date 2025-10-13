import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
} from "@/inngest/functions/workflow-utils";
import type { LectureConfig } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { getLectureById } from "@/data/lecture/repository";
import { setupFileStorage } from "@/lib/storage-utils";
import { audioProviderRegistry, ReplicateAudioProvider } from "@/services/media-generation/audio";
import { FileStorageHandler } from "@/services/media-generation/core";
import { regenerateAudio } from "@/services/lecture/orchestrators";
import { createWorkflowRun, updateWorkflowRun } from "@/data/workflow-runs";

const inngest = getInngestApp();

// Initialize audio provider registry
audioProviderRegistry.register(new ReplicateAudioProvider());

export type RegenerateSingleNarrationEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  narrationAssetId: string;
  script: string;
  model: string;
  voice: string;
  emotion?: string;
  config: LectureConfig;
};

export const regenerateSingleNarration = inngest.createFunction(
  { id: "regenerate-single-narration" },
  { event: "app/regenerate-single-narration" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      narrationAssetId,
      script,
      model,
      voice,
      emotion,
      config,
    } = event.data as RegenerateSingleNarrationEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus, publishNarrationPreview, publishNarrationComplete } = createLectureProgressPublisher({
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

    await publishStatus("Starting narration generation", 0);

    // Step 3: Generate single narration
    const generatedNarration = await step.run("generate-single-narration", async () => {
      log.info("Generating single narration", { script, model, voice, emotion, narrationAssetId });
      await publishStatus("Generating narration with AI", 0);

      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);

      const narration = await regenerateAudio(
        {
          text: script,
          voice,
          model,
          narrationId: narrationAssetId, // Use existing ID to maintain references
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

      log.info("Narration generated successfully", { narrationId: narration.id });
      return narration;
    });

    // Step 4: Publish narration preview for human review
    await step.run("publish-narration-preview", async () => {
      await publishNarrationPreview(narrationAssetId, generatedNarration);
      await publishStatus("Narration ready for review", 0, "complete");
      log.info("Narration preview published - waiting for user acceptance");
    });

    // Step 5: Wait for user decision
    const acceptancePromise = step
      .waitForEvent("wait-for-narration-acceptance", {
        event: "app/narration.accepted",
        timeout: "30m",
        match: "data.runId",
      })
      .then((event) =>
        event ? { type: "accepted" as const, event } : { type: "timeout" as const, event: null }
      );

    const rejectionPromise = step
      .waitForEvent("wait-for-narration-rejection", {
        event: "app/narration.rejected",
        timeout: "30m",
        match: "data.runId",
      })
      .then((event) =>
        event ? { type: "rejected" as const, event } : { type: "timeout" as const, event: null }
      );

    const reviewOutcome = await Promise.race([acceptancePromise, rejectionPromise]);

    if (reviewOutcome.type === "timeout") {
      throw new Error("Narration review timeout");
    }

    if (reviewOutcome.type === "rejected") {
      log.info("Narration rejected by user");
      await publishStatus("Narration rejected by user. Discarding preview.", 0, "complete");

      await step.run("mark-workflow-rejected", async () => {
        await updateWorkflowRun({
          runId,
          status: "succeeded",
          currentStep: 1,
          context: { reviewOutcome: "rejected" },
        });
      });

      return { runId, narrationAssetId, narrationAsset: generatedNarration, rejected: true };
    }

    log.info("Narration accepted by user");

    // Step 6: Replace narration in lecture's narration array
    await step.run("save-accepted-narration", async () => {
      await publishStatus("Saving accepted narration", 0);

      const lecture = await getLectureById({ lectureId });
      if (!lecture) {
        throw new Error("Lecture not found");
      }

      // Find and replace the narration with the same ID
      const updatedNarrations = (lecture.narration || []).map((narr) =>
        narr.id === narrationAssetId
          ? {
              id: narrationAssetId, // Keep the same ID
              finalScript: script, // Update with new script
              model: model || narr.model || generatedNarration.model, // Update model if provided
              voice: voice || narr.voice || generatedNarration.voice, // Update voice if provided
              sourceUrl: generatedNarration.sourceUrl,
              duration: generatedNarration.duration,
            }
          : narr
      );

      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { narration: updatedNarrations },
      });

      log.info("Narration saved successfully", { narrationAssetId });
    });

    // Step 7: Publish narration completion to trigger UI refresh
    await step.run("publish-narration-completion", async () => {
      await publishNarrationComplete(lectureId, narrationAssetId);
      log.info("Narration completion event published");
    });

    // Step 8: Mark workflow as complete
    await step.run("mark-workflow-complete", async () => {
      await updateWorkflowRun({
        runId,
        status: "succeeded",
        currentStep: 1,
      });
    });

    await publishStatus("Narration regeneration complete", 0, "complete");

    return { runId, narrationAssetId, narrationAsset: generatedNarration };
  }
);
