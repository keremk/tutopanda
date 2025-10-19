import { ProviderRegistry, isMediaGenerationError, createMediaGenerationError } from "../core";
import type { ImageProvider, ImageGenerationParams, ImageConfig } from "./types";
import type { Logger } from "../core";
import { DEFAULT_IMAGE_MODEL } from "@/lib/models";

/**
 * Global registry for image providers
 */
export const imageProviderRegistry = new ProviderRegistry<ImageProvider>();

/**
 * Pure image generation function.
 * Generates a single image from a prompt and configuration.
 * No domain knowledge, no storage, just pure I/O.
 *
 * @param prompt - The text prompt for image generation
 * @param config - Image configuration (dimensions, aspect ratio, etc.)
 * @param options - Optional provider override and logger
 * @returns Buffer containing the generated image
 */
export async function generateImage(
  prompt: string,
  config: ImageConfig,
  options?: {
    provider?: ImageProvider;
    logger?: Logger;
  }
): Promise<Buffer> {
  const { provider: customProvider, logger } = options || {};

  // Select provider based on model
  const model = config.model || DEFAULT_IMAGE_MODEL;
  const provider = customProvider || imageProviderRegistry.getProvider(model);

  logger?.info("Generating image", {
    promptPreview: prompt.substring(0, 100) + "...",
    model,
    aspectRatio: config.aspectRatio,
    size: config.size,
  });

  const params: ImageGenerationParams = {
    prompt,
    aspectRatio: config.aspectRatio || "16:9",
    size: config.size || "1080",
    width: config.width || 1920,
    height: config.height || 1080,
    model: config.model,
  };

  try {
    const result = await provider.generateImage(params);

    if (typeof result === "string") {
      const response = await fetch(result);
      if (!response.ok) {
        throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    return result;
  } catch (error) {
    if (isMediaGenerationError(error)) {
      logger?.error("Image generation failed", {
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
      message: "Unexpected error during image generation",
      isRetryable: false,
      userActionRequired: false,
      cause: error,
    });

    logger?.error("Image generation failed", {
      provider: wrapped.provider,
      model: wrapped.model,
      code: wrapped.code,
      message: wrapped.message,
    });

    throw wrapped;
  }
}
