import { ProviderRegistry } from "../core";
import type { MusicProvider, MusicGenerationParams, MusicConfig } from "./types";
import type { Logger } from "../core";

/**
 * Global registry for music providers
 */
export const musicProviderRegistry = new ProviderRegistry<MusicProvider>();

/**
 * Pure music generation function.
 * Generates a single music file from a prompt.
 * No domain knowledge, no storage, just pure I/O.
 *
 * @param prompt - The text prompt for music generation
 * @param config - Music configuration (duration, model)
 * @param options - Optional provider override and logger
 * @returns Buffer containing the generated music
 */
export async function generateMusic(
  prompt: string,
  config: MusicConfig,
  options?: {
    provider?: MusicProvider;
    logger?: Logger;
  }
): Promise<Buffer> {
  const { provider: customProvider, logger } = options || {};

  const model = config.model || "stability-ai/stable-audio-2.5";
  const provider = customProvider || musicProviderRegistry.getProvider(model);

  logger?.info("Generating music", {
    promptPreview: prompt.substring(0, 100) + "...",
    durationSeconds: config.durationSeconds,
    model,
  });

  const params: MusicGenerationParams = {
    prompt,
    durationSeconds: config.durationSeconds,
    model: config.model,
  };

  const buffer = await provider.generateMusic(params);

  logger?.info("Music generated", {
    bufferSize: buffer.length,
  });

  return buffer;
}
