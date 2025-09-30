import Replicate from "replicate";
import { Input, ALL_FORMATS, BlobSource } from "mediabunny";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { NarrationSettings, LectureScript } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { setupFileStorage, saveFileToStorage } from "@/lib/storage-utils";

const inngest = getInngestApp();
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

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

const extractAudioDuration = async (audioBuffer: Buffer): Promise<number> => {
  const blob = new Blob([audioBuffer] as BlobPart[], { type: "audio/mpeg" });
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });

  const duration = await input.computeDuration();
  return duration;
};

const generateAudioForSegment = async (
  text: string,
  voiceId: string,
  modelId: string
): Promise<Buffer> => {
  const input = {
    text,
    voice_id: voiceId,
    emotion: "neutral",
    language_boost: "English",
    english_normalization: true,
  };

  // Ensure modelId is in the correct format (owner/model or owner/model:version)
  const model = modelId as `${string}/${string}` | `${string}/${string}:${string}`;
  const output = await replicate.run(model, { input }) as any;

  if (!output) {
    throw new Error("Audio generation failed - no output returned");
  }

  // Fetch the audio file from the URL
  const response = await fetch(output.url());
  if (!response.ok) {
    throw new Error(`Failed to download audio: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
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

    const storage = setupFileStorage();
    const defaultVoiceId = process.env.DEFAULT_VOICE_ID;
    const defaultModelId = process.env.DEFAULT_VOICE_MODEL_ID;

    if (!defaultVoiceId || !defaultModelId) {
      throw new Error("DEFAULT_VOICE_ID or DEFAULT_VOICE_MODEL_ID not configured");
    }

    await publishStatus(
      `Generating narration for ${narrationToProcess.length} segment${narrationToProcess.length === 1 ? "" : "s"}`,
      workflowStep
    );

    const updatedNarration = await Promise.all(
      narrationToProcess.map((narrationAsset, index) =>
        step.run(`generate-narration-${index}`, async () => {
          const segmentNo = index + 1;
          const segment = script.segments[index];

          if (!segment) {
            throw new Error(`No script segment found for narration ${index}`);
          }

          const finalScript = segment.narration;

          log.info("Generating narration", {
            narrationId: narrationAsset.id,
            segmentNo,
            scriptLength: finalScript.length,
            voice: narrationAsset.voice || defaultVoiceId,
            model: narrationAsset.model || defaultModelId,
          });

          const voiceId = narrationAsset.voice || defaultVoiceId;
          const modelId = narrationAsset.model || defaultModelId;

          const audioBuffer = await generateAudioForSegment(
            finalScript,
            voiceId,
            modelId
          );

          const duration = await extractAudioDuration(audioBuffer);

          const filePath = `${userId}/${projectId}/narration/lecture-${lectureId}-${segmentNo}.mp3`;
          await saveFileToStorage(storage, audioBuffer, filePath);

          await publishStatus(
            `Narration ${segmentNo}/${narrationToProcess.length} generated`,
            workflowStep
          );

          return {
            ...narrationAsset,
            finalScript,
            duration,
            sourceUrl: filePath,
          } satisfies NarrationSettings;
        })
      )
    );

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