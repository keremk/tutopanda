import { ProviderRegistry } from "../core";
import type { AudioProvider, AudioGenerationParams, AudioConfig } from "./types";
import type { Logger } from "../core";

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

  const model = config.model || "aura-asteria-en";
  const provider = customProvider || audioProviderRegistry.getProvider(model);

  logger?.info("Generating audio", {
    textLength: text.length,
    voice: config.voice,
    model,
  });

  const params: AudioGenerationParams = {
    text,
    voiceId: config.voice,
    modelId: model,
  };

  const result = await provider.generateAudio(params);

  logger?.info("Audio generated", {
    duration: result.duration,
    bufferSize: result.buffer.length,
  });

  return result;
}
