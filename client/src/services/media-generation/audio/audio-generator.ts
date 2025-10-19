import { ProviderRegistry, isMediaGenerationError, createMediaGenerationError } from "../core";
import type { AudioProvider, AudioGenerationParams, AudioConfig } from "./types";
import type { Logger } from "../core";
import { NARRATION_MODELS } from "@/lib/models";

/**
 * Global registry for audio providers
 */
export const audioProviderRegistry = new ProviderRegistry<AudioProvider>();

/**
 * Result of audio generation
 */
export type AudioResult = {
  buffer: Buffer;
  duration: number;
};

/**
 * Pure audio generation function.
 * Generates a single audio file from text using TTS.
 * No domain knowledge, no storage, just pure I/O.
 *
 * @param text - The text to convert to speech
 * @param config - Audio configuration (voice, model)
 * @param options - Optional provider override and logger
 * @returns AudioResult containing the buffer and duration
 */
export async function generateAudio(
  text: string,
  config: AudioConfig,
  options?: {
    provider?: AudioProvider;
    logger?: Logger;
  }
): Promise<AudioResult> {
  const { provider: customProvider, logger } = options || {};

  const model = config.model || NARRATION_MODELS.MINIMAX_SPEECH_02_HD;
  const provider = customProvider || audioProviderRegistry.getProvider(model);

  logger?.info("Generating audio", {
    textLength: text.length,
    voice: config.voice,
    model,
    emotion: config.emotion,
    languageBoost: config.languageBoost,
    englishNormalization: config.englishNormalization,
  });

  const params: AudioGenerationParams = {
    text,
    voiceId: config.voice,
    modelId: model,
    emotion: config.emotion,
    languageBoost: config.languageBoost,
    englishNormalization: config.englishNormalization,
  };

  try {
    const result = await provider.generateAudio(params);

    logger?.info("Audio generated", {
      duration: result.duration,
      bufferSize: result.buffer.length,
    });

    return result;
  } catch (error) {
    if (isMediaGenerationError(error)) {
      logger?.error("Audio generation failed", {
        provider: error.provider,
        model: error.model,
        code: error.code,
        message: error.message,
        providerCode: error.providerCode,
      });
      throw error;
    }

    const wrapped = createMediaGenerationError({
      code: "UNKNOWN",
      provider: provider.name,
      model,
      message: "Unexpected error during audio generation",
      isRetryable: false,
      userActionRequired: false,
      cause: error,
    });

    logger?.error("Audio generation failed", {
      provider: wrapped.provider,
      model: wrapped.model,
      code: wrapped.code,
      message: wrapped.message,
    });

    throw wrapped;
  }
}
