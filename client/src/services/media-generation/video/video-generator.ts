import { ProviderRegistry } from "../core";
import type { VideoProvider, VideoGenerationParams, VideoConfig } from "./types";
import type { Logger } from "../core";
import { DEFAULT_VIDEO_MODEL } from "@/lib/models";

export const videoProviderRegistry = new ProviderRegistry<VideoProvider>();

/**
 * Pure video generation function.
 * Generates a single video from a prompt, starting image, and configuration.
 * No domain knowledge, no storage, just pure I/O.
 */
export async function generateVideo(
  prompt: string,
  startingImage: Buffer,
  config: VideoConfig,
  options?: {
    provider?: VideoProvider;
    logger?: Logger;
  }
): Promise<Buffer> {
  const { provider: customProvider, logger } = options || {};

  const model = config.model || DEFAULT_VIDEO_MODEL;
  const provider = customProvider || videoProviderRegistry.getProvider(model);

  logger?.info("Generating video", {
    promptPreview: prompt.substring(0, 100) + "...",
    model,
    resolution: config.resolution,
    duration: config.duration,
  });

  const params: VideoGenerationParams = {
    prompt,
    startingImage,
    aspectRatio: config.aspectRatio || "16:9",
    resolution: config.resolution || "480",
    duration: Number.parseInt(config.duration || "10", 10),
    model: config.model,
  };

  const result = await provider.generateVideo(params);

  // Ensure we always return a Buffer
  if (typeof result === "string") {
    const response = await fetch(result);
    if (!response.ok) {
      throw new Error(`Failed to fetch video from URL: ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  return result;
}
