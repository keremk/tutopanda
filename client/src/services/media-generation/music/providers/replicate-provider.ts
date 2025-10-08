import Replicate from "replicate";
import type { MusicProvider, MusicGenerationParams } from "../types";

/**
 * Replicate music generation provider.
 * Supports Stable Audio and other music generation models.
 */
export class ReplicateMusicProvider implements MusicProvider {
  name = "replicate";
  supportedModels = [
    "stability-ai/stable-audio-2.5",
  ];

  private replicate: Replicate;

  constructor(apiToken?: string) {
    this.replicate = new Replicate({
      auth: apiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateMusic(params: MusicGenerationParams): Promise<Buffer> {
    const { prompt, durationSeconds, model = "stability-ai/stable-audio-2.5" } = params;

    const input = {
      prompt,
      duration: Math.round(durationSeconds), // Must be an integer
    };

    const output = (await this.replicate.run(model as `${string}/${string}`, {
      input,
    })) as { url: () => string };

    if (!output) {
      throw new Error("Music generation failed - no output returned");
    }

    // Fetch the audio file from the URL
    const response = await fetch(output.url());
    if (!response.ok) {
      throw new Error(`Failed to download music: ${response.statusText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
