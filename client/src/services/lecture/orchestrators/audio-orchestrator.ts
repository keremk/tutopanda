import type { LectureScript, NarrationSettings } from "@/types/types";
import { getNarrationLanguageSettings } from "@/lib/models";
import {
  generateAudiosThrottled,
  type AudioGenerationRequest,
} from "@/services/media-generation/core";
import type { Logger } from "@/services/media-generation/core";
import type { LectureAssetStorage } from "@/services/lecture/storage";

/**
 * Request for generating all lecture audio narrations
 */
export type GenerateLectureAudioRequest = {
  script: LectureScript;
  voice: string;
  model: string;
  runId: string;
  emotion?: string;
  language?: string;
};

/**
 * Context for audio generation (where/who)
 */
export type AudioGenerationContext = {
  userId: string;
  projectId: number;
  lectureId: number;
  maxConcurrency?: number;
};

/**
 * Dependencies for audio orchestrator (injected for testability)
 */
export type AudioOrchestratorDeps = {
  generateAudios?: typeof generateAudiosThrottled;
  assetStorage: LectureAssetStorage;
  logger?: Logger;
  onAudioProgress?: (current: number, total: number) => void | Promise<void>;
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
  const { script, voice, model, runId, emotion, language } = request;
  const { maxConcurrency = 5 } = context;
  const { generateAudios = generateAudiosThrottled, assetStorage, logger, onAudioProgress } = deps;

  const segments = script.segments || [];
  const languageSettings = getNarrationLanguageSettings(model, language);

  logger?.info("Starting lecture audio generation", {
    segmentCount: segments.length,
    voice,
    model,
    emotion,
    language: languageSettings.language ?? language,
  });

  // Step 1: Build audio generation requests
  const audioRequests: AudioGenerationRequest[] = segments.map((segment) => ({
    text: segment.narration,
    config: {
      voice,
      model,
      emotion,
      languageBoost: languageSettings.languageBoost,
      englishNormalization: languageSettings.englishNormalization,
    },
  }));

  // Step 2: Generate audio with throttling
  const audioResults = await generateAudios(audioRequests, {
    maxConcurrency,
    logger,
    onBatchComplete: (batchIndex, totalBatches) => {
      logger?.info(`Completed audio batch ${batchIndex}/${totalBatches}`);
    },
    onItemComplete: async (current, total) => {
      await onAudioProgress?.(current, total);
    },
  });

  // Step 3: Save audio files and build assets
  const narrationAssets: NarrationSettings[] = await Promise.all(
    audioResults.map(async (result, segmentIndex) => {
      const id = `narration-${runId}-${segmentIndex}`;
      const label = `Segment ${segmentIndex + 1}`;
      const baseAsset: NarrationSettings = {
        id,
        label,
        finalScript: segments[segmentIndex].narration,
        model,
        voice,
        emotion,
        language: languageSettings.language ?? language,
      };

      if (result.ok) {
        const { audio } = result;
        const sourceUrl = await assetStorage.saveNarration(audio.buffer, id);

        logger?.info("Audio saved", {
          id,
          segmentIndex,
          duration: audio.duration,
          path: sourceUrl,
        });

        return {
          ...baseAsset,
          duration: audio.duration,
          sourceUrl,
          status: "generated",
        } as NarrationSettings;
      }

      const error = result.error;

      logger?.warn?.("Audio generation flagged", {
        id,
        segmentIndex,
        code: error.code,
        message: error.message,
        providerCode: error.providerCode,
      });

      return {
        ...baseAsset,
        status: error.userActionRequired ? "needs_prompt_update" : "failed",
        error: {
          code: error.code,
          message: error.message,
          provider: error.provider,
          providerCode: error.providerCode,
        },
      } as NarrationSettings;
    })
  );

  const generatedCount = narrationAssets.filter((asset) => asset.sourceUrl).length;
  const needsPromptUpdateCount = narrationAssets.filter((asset) => asset.status === "needs_prompt_update").length;
  const failedCount = narrationAssets.filter((asset) => asset.status === "failed").length;

  logger?.info("Lecture audio generation complete", {
    totalNarrations: narrationAssets.length,
    generatedCount,
    needsPromptUpdateCount,
    failedCount,
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
  emotion?: string;
  language?: string;
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
  _context: AudioGenerationContext,
  deps: AudioOrchestratorDeps
): Promise<NarrationSettings> {
  const { text, voice, model, narrationId, emotion, language } = request;
  const { generateAudios = generateAudiosThrottled, assetStorage, logger } = deps;
  const languageSettings = getNarrationLanguageSettings(model, language);

  logger?.info("Regenerating audio", {
    narrationId,
    textLength: text.length,
    voice,
    model,
    emotion,
    language: languageSettings.language ?? language,
  });

  // Generate single audio
  const [outcome] = await generateAudios(
    [
      {
        text,
        config: {
          voice,
          model,
          emotion,
          languageBoost: languageSettings.languageBoost,
          englishNormalization: languageSettings.englishNormalization,
        },
      },
    ],
    { logger }
  );

  if (!outcome) {
    throw new Error("No audio generation result received for regeneration");
  }

  const baseAsset: NarrationSettings = {
    id: narrationId,
    label: "Regenerated Narration",
    finalScript: text,
    model,
    voice,
    emotion,
    language: languageSettings.language ?? language,
  };

  if (outcome.ok) {
    const { audio } = outcome;
    const sourceUrl = await assetStorage.saveNarration(audio.buffer, narrationId);

    logger?.info("Audio regenerated and saved", {
      narrationId,
      duration: audio.duration,
      path: sourceUrl,
    });

    return {
      ...baseAsset,
      duration: audio.duration,
      sourceUrl,
      status: "generated",
    } as NarrationSettings;
  }

  const error = outcome.error;

  logger?.warn?.("Audio regeneration flagged", {
    narrationId,
    code: error.code,
    message: error.message,
    providerCode: error.providerCode,
  });

  return {
    ...baseAsset,
    status: error.userActionRequired ? "needs_prompt_update" : "failed",
    error: {
      code: error.code,
      message: error.message,
      provider: error.provider,
      providerCode: error.providerCode,
    },
  } as NarrationSettings;
}
