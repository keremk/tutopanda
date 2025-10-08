import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { NarrationSettings, LectureScript } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { setupFileStorage } from "@/lib/storage-utils";
import { audioProviderRegistry, ReplicateAudioProvider } from "@/services/media-generation/audio";
import { FileStorageHandler } from "@/services/media-generation/core";
import { generateLectureAudio } from "@/services/lecture/orchestrators";

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

    const defaultVoice = narrationToProcess[0]?.voice || defaultVoiceId;
    const defaultModel = narrationToProcess[0]?.model || defaultModelId;

    await publishStatus(
      `Generating narration for ${limitedScript.segments.length} segment${limitedScript.segments.length === 1 ? "" : "s"}`,
      workflowStep
    );

    const updatedNarration = await step.run("generate-lecture-audio", async () => {
      const storage = setupFileStorage();
      const storageHandler = new FileStorageHandler(storage);

      return generateLectureAudio(
        {
          script: limitedScript,
          voice: defaultVoice,
          model: defaultModel,
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