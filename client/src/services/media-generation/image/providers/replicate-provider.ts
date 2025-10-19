import Replicate from "replicate";
import type { ImageProvider, ImageGenerationParams } from "../types";
import { imageModelValues, DEFAULT_IMAGE_MODEL } from "@/lib/models";
import { mapReplicateErrorToMediaError } from "@/services/media-generation/core";
import { createMediaGenerationError } from "@/services/media-generation/core";

/**
 * Replicate image generation provider.
 * Supports models like bytedance/seedream-4.
 */
export class ReplicateImageProvider implements ImageProvider {
  name = "replicate";
  supportedModels = [...imageModelValues];

  private replicate: Replicate;

  constructor(apiToken?: string) {
    this.replicate = new Replicate({
      auth: apiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateImage(params: ImageGenerationParams): Promise<Buffer> {
    const { prompt, aspectRatio, size, model = DEFAULT_IMAGE_MODEL } = params;

    // Map config size values to Replicate API size values
    const sizeMapping: Record<string, string> = {
      "480": "1K",
      "720": "1K",
      "1080": "1K",
    };
    const replicateSize = sizeMapping[size] || "1K";

    const input = {
      size: replicateSize,
      prompt,
      max_images: 1,
      image_input: [],
      aspect_ratio: aspectRatio || "16:9",
      sequential_image_generation: "disabled",
    };

    let output: unknown[];

    try {
      output = (await this.replicate.run(model as `${string}/${string}`, {
        input,
      })) as unknown[];
    } catch (error) {
      throw mapReplicateErrorToMediaError({
        error,
        model,
        provider: this.name,
        context: "Replicate failed to generate image",
        promptPreview: prompt.substring(0, 100),
      });
    }

    if (!output || !Array.isArray(output) || !output[0]) {
      throw createMediaGenerationError({
        code: "PROVIDER_FAILURE",
        provider: this.name,
        model,
        message: `Replicate returned no image output for prompt: "${prompt.substring(0, 50)}..."`,
        isRetryable: false,
        userActionRequired: false,
      });
    }

    const imageUrl = output[0] as string;

    // Download the image and return as buffer
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw createMediaGenerationError({
        code: "PROVIDER_FAILURE",
        provider: this.name,
        model,
        message: `Failed to download image (${response.statusText})`,
        isRetryable: false,
        userActionRequired: false,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
