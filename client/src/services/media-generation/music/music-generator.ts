import { ProviderRegistry, isMediaGenerationError, createMediaGenerationError } from "../core";
import type { MusicProvider, MusicGenerationParams, MusicConfig } from "./types";
import type { Logger } from "../core";
import { DEFAULT_MUSIC_MODEL } from "@/lib/models";

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

  const model = config.model || DEFAULT_MUSIC_MODEL;
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

  try {
    const buffer = await provider.generateMusic(params);

    logger?.info("Music generated", {
      bufferSize: buffer.length,
    });

    return buffer;
  } catch (error) {
    if (isMediaGenerationError(error)) {
      logger?.error("Music generation failed", {
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
      message: "Unexpected error during music generation",
      isRetryable: false,
      userActionRequired: false,
      cause: error,
    });

    logger?.error("Music generation failed", {
      provider: wrapped.provider,
      model: wrapped.model,
      code: wrapped.code,
      message: wrapped.message,
    });

    throw wrapped;
  }
}
