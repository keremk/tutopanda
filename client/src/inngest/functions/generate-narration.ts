import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { NarrationSettings, LectureScript } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { getLectureById } from "@/data/lecture/repository";
import { setupFileStorage } from "@/lib/storage-utils";
import { getDefaultVoiceForNarrationModel, getNarrationModelDefinition } from "@/lib/models";
import { audioProviderRegistry, ReplicateAudioProvider } from "@/services/media-generation/audio";
import { FileStorageHandler } from "@/services/media-generation/core";
import { generateLectureAudio } from "@/services/lecture/orchestrators";
import { createLectureAssetStorage } from "@/services/lecture/storage";

const inngest = getInngestApp();

// Initialize audio provider registry
audioProviderRegistry.register(new ReplicateAudioProvider());

const MAX_NARRATION_GENERATION_CALLS = Number.parseInt(
  process.env.MAX_NARRATION_GENERATION_CALLS ?? "3",
  10
);

const NARRATION_GENERATION_WORKFLOW_STEP = 5;

export type GenerateNarrationEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  script: LectureScript;
  narration: NarrationSettings[];
  workflowStep?: number;
  totalWorkflowSteps?: number;
};

export const generateNarration = inngest.createFunction(
  { id: "generate-narration" },
  { event: "app/generate-narration" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      script,
      narration,
      workflowStep = NARRATION_GENERATION_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
    } = event.data as GenerateNarrationEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    // Check if we should skip this step (resume mode)
    const shouldSkip = await step.run("check-existing-narration", async () => {
      const lecture = await getLectureById({ lectureId });
      const hasNarration = lecture?.narration && lecture.narration.length > 0;
      const forceRegenerate = (event.data as any).context?.forceRegenerate === true;
      return hasNarration && !forceRegenerate;
    });

    if (shouldSkip) {
      const lecture = await getLectureById({ lectureId });
      await publishStatus("Using existing narration", workflowStep, "complete");
      log.info("Skipping narration generation - using existing narration");
      return { runId, narration: lecture!.narration!, skipped: true };
    }

    const segments = script?.segments ?? [];
    if (segments.length === 0) {
      const message = "No script segments available for narration";
      log.error(message);
      await publishStatus(message, workflowStep, "error");
      throw new Error(message);
    }

    if (!narration || narration.length === 0) {
      const message = "No narration settings available";
      log.error(message);
      await publishStatus(message, workflowStep, "error");
      throw new Error(message);
    }

    const limit = Math.min(narration.length, MAX_NARRATION_GENERATION_CALLS);

    if (limit <= 0) {
      const message = "Skipping narration generation (limit is zero)";
      log.info(message, { limit });
      await publishStatus(message, workflowStep, "complete");
      return { runId, narration: [], skipped: true };
    }

    const narrationToProcess = narration.slice(0, limit);

    await step.run("validate-project-access", async () => {
      const project = await getProjectById(projectId, userId);
      if (!project) {
        throw new Error(`Project ${projectId} not found or access denied`);
      }
    });

    const defaultVoiceId = process.env.DEFAULT_VOICE_ID;
    const defaultModelId = process.env.DEFAULT_VOICE_MODEL_ID;

    if (!defaultVoiceId || !defaultModelId) {
      throw new Error("DEFAULT_VOICE_ID or DEFAULT_VOICE_MODEL_ID not configured");
    }

    // Limit segments to process
    const limitedScript: LectureScript = {
      ...script,
      segments: script.segments?.slice(0, limit) || [],
    };

    const selectedModel = narrationToProcess[0]?.model || defaultModelId;
    const modelDefinition = getNarrationModelDefinition(selectedModel);
    const selectedVoice =
      narrationToProcess[0]?.voice ||
      getDefaultVoiceForNarrationModel(selectedModel) ||
      defaultVoiceId;
    const selectedEmotion = modelDefinition?.supportsEmotion ? narrationToProcess[0]?.emotion : undefined;
    const selectedLanguage = narrationToProcess[0]?.language;

    await publishStatus(
      `Generating narration for ${limitedScript.segments.length} segment${limitedScript.segments.length === 1 ? "" : "s"}`,
      workflowStep
    );

    const updatedNarration = await step.run("generate-lecture-audio", async () => {
      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);

      const assetStorage = createLectureAssetStorage(
        { userId, projectId, lectureId },
        { storageHandler }
      );

      return generateLectureAudio(
        {
          script: limitedScript,
          voice: selectedVoice,
          model: selectedModel,
          runId,
          emotion: selectedEmotion,
          language: selectedLanguage,
        },
        {
          userId,
          projectId,
          lectureId,
          maxConcurrency: 5,
        },
        {
          assetStorage,
          logger: log,
          onAudioProgress: async (current, total) => {
            await publishStatus(
              `Generated narration ${current}/${total}`,
              workflowStep
            );
          },
        }
      );
    });

    await publishStatus("Narration generated successfully", workflowStep, "complete");

    log.info("Narration generation complete", {
      generatedNarrations: updatedNarration.length,
      totalDuration: updatedNarration.reduce((sum, n) => sum + (n.duration || 0), 0),
    });

    await step.run("save-generated-narration", async () => {
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { narration: updatedNarration },
      });
    });

    return { runId, narration: updatedNarration };
  }
);
