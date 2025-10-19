import Replicate from "replicate";
import type { MusicProvider, MusicGenerationParams } from "../types";
import { MUSIC_MODELS, DEFAULT_MUSIC_MODEL } from "@/lib/models";
import { mapReplicateErrorToMediaError, createMediaGenerationError } from "@/services/media-generation/core";

/**
 * Replicate music generation provider.
 * Supports Stable Audio and other music generation models.
 */
export class ReplicateMusicProvider implements MusicProvider {
  name = "replicate";
  supportedModels = [MUSIC_MODELS.STABILITY_STABLE_AUDIO_2_5];

  private replicate: Replicate;

  constructor(apiToken?: string) {
    this.replicate = new Replicate({
      auth: apiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateMusic(params: MusicGenerationParams): Promise<Buffer> {
    const { prompt, durationSeconds, model = DEFAULT_MUSIC_MODEL } = params;

    const input = {
      prompt,
      duration: Math.round(durationSeconds), // Must be an integer
    };

    let output: { url: () => string };

    try {
      output = (await this.replicate.run(model as `${string}/${string}`, {
        input,
      })) as { url: () => string };
    } catch (error) {
      throw mapReplicateErrorToMediaError({
        error,
        model,
        provider: this.name,
        context: "Replicate failed to generate music",
        promptPreview: prompt.substring(0, 100),
      });
    }

    if (!output) {
      throw createMediaGenerationError({
        code: "PROVIDER_FAILURE",
        provider: this.name,
        model,
        message: "Replicate returned no music output",
        isRetryable: false,
        userActionRequired: false,
      });
    }

    // Fetch the audio file from the URL
    const response = await fetch(output.url());
    if (!response.ok) {
      throw createMediaGenerationError({
        code: "PROVIDER_FAILURE",
        provider: this.name,
        model,
        message: `Failed to download music (${response.statusText})`,
        isRetryable: false,
        userActionRequired: false,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}
