import Replicate from "replicate";
import type { ImageProvider, ImageGenerationParams } from "../types";

/**
 * Replicate image generation provider.
 * Supports models like bytedance/seedream-4.
 */
export class ReplicateImageProvider implements ImageProvider {
  name = "replicate";
  supportedModels = ["bytedance/seedream-4", "google/nano-banana", "qwen/qwen-image"];

  private replicate: Replicate;

  constructor(apiToken?: string) {
    this.replicate = new Replicate({
      auth: apiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateImage(params: ImageGenerationParams): Promise<Buffer> {
    const { prompt, aspectRatio, size, model = "bytedance/seedream-4" } = params;

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

    const output = (await this.replicate.run(model as `${string}/${string}`, {
      input,
    })) as unknown[];

    if (!output || !Array.isArray(output) || !output[0]) {
      throw new Error(`Image generation failed for prompt: ${prompt.substring(0, 50)}...`);
    }

    const imageUrl = output[0] as string;

    // Download the image and return as buffer
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
