import type { LectureScript, NarrationSettings } from "@/types/types";
import {
  generateAudiosThrottled,
  type AudioGenerationRequest,
} from "@/services/media-generation/core";
import type { Logger } from "@/services/media-generation/core";

/**
 * Request for generating all lecture audio narrations
 */
export type GenerateLectureAudioRequest = {
  script: LectureScript;
  voice: string;
  model: string;
  runId: string;
};

/**
 * Context for audio generation (where/who)
 */
export type AudioGenerationContext = {
  userId: string;
  projectId: number;
  maxConcurrency?: number;
};

/**
 * Dependencies for audio orchestrator (injected for testability)
 */
export type AudioOrchestratorDeps = {
  generateAudios?: typeof generateAudiosThrottled;
  saveFile: (buffer: Buffer, path: string) => Promise<void>;
  logger?: Logger;
};

/**
 * Generate audio narrations for all segments in a lecture.
 * Domain orchestrator that coordinates TTS generation and storage.
 *
 * @param request - Lecture script and audio config
 * @param context - User/project context
 * @param deps - Injected dependencies for testability
 * @returns Array of narration assets with URLs
 */
export async function generateLectureAudio(
  request: GenerateLectureAudioRequest,
  context: AudioGenerationContext,
  deps: AudioOrchestratorDeps
): Promise<NarrationSettings[]> {
  const { script, voice, model, runId } = request;
  const { userId, projectId, maxConcurrency = 5 } = context;
  const { generateAudios = generateAudiosThrottled, saveFile, logger } = deps;

  const segments = script.segments || [];

  logger?.info("Starting lecture audio generation", {
    segmentCount: segments.length,
    voice,
    model,
  });

  // Step 1: Build audio generation requests
  const audioRequests: AudioGenerationRequest[] = segments.map((segment) => ({
    text: segment.narration,
    config: {
      voice,
      model,
    },
  }));

  // Step 2: Generate audio with throttling
  const audioResults = await generateAudios(audioRequests, {
    maxConcurrency,
    logger,
    onBatchComplete: (batchIndex, totalBatches) => {
      logger?.info(`Completed audio batch ${batchIndex}/${totalBatches}`);
    },
  });

  // Step 3: Save audio files and build assets
  const narrationAssets: NarrationSettings[] = await Promise.all(
    audioResults.map(async (result, segmentIndex) => {
      const id = `narration-${runId}-${segmentIndex}`;
      const relativePath = `narration/${id}.mp3`;
      const sourceUrl = `${userId}/${projectId}/${relativePath}`;

      // Save to storage
      const fullPath = sourceUrl;
      await saveFile(result.buffer, fullPath);

      logger?.info("Audio saved", {
        id,
        segmentIndex,
        duration: result.duration,
        path: fullPath,
      });

      return {
        id,
        label: `Segment ${segmentIndex + 1}`,
        finalScript: segments[segmentIndex].narration,
        model,
        voice,
        duration: result.duration,
        sourceUrl,
      };
    })
  );

  logger?.info("Lecture audio generation complete", {
    totalNarrations: narrationAssets.length,
  });

  return narrationAssets;
}

/**
 * Request for regenerating a single audio narration
 */
export type RegenerateAudioRequest = {
  text: string;
  voice: string;
  model: string;
  narrationId: string;
};

/**
 * Regenerate a single audio narration.
 * Used for UI-driven regeneration or agent-driven updates.
 *
 * @param request - Text and audio config
 * @param context - User/project context
 * @param deps - Injected dependencies for testability
 * @returns Single narration asset with URL
 */
export async function regenerateAudio(
  request: RegenerateAudioRequest,
  context: AudioGenerationContext,
  deps: AudioOrchestratorDeps
): Promise<NarrationSettings> {
  const { text, voice, model, narrationId } = request;
  const { userId, projectId } = context;
  const { generateAudios = generateAudiosThrottled, saveFile, logger } = deps;

  logger?.info("Regenerating audio", {
    narrationId,
    textLength: text.length,
    voice,
    model,
  });

  // Generate single audio
  const [result] = await generateAudios(
    [
      {
        text,
        config: { voice, model },
      },
    ],
    { logger }
  );

  // Save audio
  const relativePath = `narration/${narrationId}.mp3`;
  const sourceUrl = `${userId}/${projectId}/${relativePath}`;
  const fullPath = sourceUrl;
  await saveFile(result.buffer, fullPath);

  logger?.info("Audio regenerated and saved", {
    narrationId,
    duration: result.duration,
    path: fullPath,
  });

  return {
    id: narrationId,
    label: "Regenerated Narration",
    finalScript: text,
    model,
    voice,
    duration: result.duration,
    sourceUrl,
  };
}
