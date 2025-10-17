import Replicate from "replicate";
import type { VideoProvider, VideoGenerationParams } from "../types";
import { videoModelValues, DEFAULT_VIDEO_MODEL } from "@/lib/models";

/**
 * Replicate video generation provider.
 * Supports models like bytedance/seedance-1-lite.
 */
export class ReplicateVideoProvider implements VideoProvider {
  name = "replicate";
  supportedModels = [...videoModelValues];

  private replicate: Replicate;

  constructor(apiToken?: string) {
    this.replicate = new Replicate({
      auth: apiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateVideo(params: VideoGenerationParams): Promise<Buffer> {
    const { prompt, startingImage, aspectRatio, resolution, duration, model = DEFAULT_VIDEO_MODEL } = params;

    // Convert buffer to base64 for Replicate API
    const imageBase64 = `data:image/jpeg;base64,${startingImage.toString('base64')}`;

    const input = {
      prompt,
      image: imageBase64,
      duration,
      aspect_ratio: aspectRatio || "16:9",
      resolution: resolution || "480",
    };

    const output = (await this.replicate.run(model as `${string}/${string}`, {
      input,
    })) as unknown;

    // Handle output - might be URL or array of URLs
    let videoUrl: string;
    if (Array.isArray(output) && output[0]) {
      videoUrl = output[0] as string;
    } else if (typeof output === 'string') {
      videoUrl = output;
    } else {
      throw new Error(`Video generation failed for prompt: ${prompt.substring(0, 50)}...`);
    }

    // Download the video and return as buffer
    const response = await fetch(videoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download video: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
