import Replicate from "replicate";
import { Input, ALL_FORMATS, BlobSource } from "mediabunny";
import type { AudioProvider, AudioGenerationParams, AudioGenerationResult } from "../types";
import { NARRATION_MODELS, DEFAULT_NARRATION_MODEL } from "@/lib/models";
import { mapReplicateErrorToMediaError, createMediaGenerationError } from "@/services/media-generation/core";

/**
 * Extract audio duration from buffer using mediabunny
 */
async function extractAudioDuration(audioBuffer: Buffer): Promise<number> {
  const blob = new Blob([audioBuffer] as BlobPart[], { type: "audio/mpeg" });
  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(blob),
  });

  const duration = await input.computeDuration();
  return duration;
}

/**
 * Replicate audio/TTS generation provider.
 * Supports ElevenLabs and other TTS models on Replicate.
 */
export class ReplicateAudioProvider implements AudioProvider {
  name = "replicate";
  supportedModels = [NARRATION_MODELS.MINIMAX_SPEECH_02_HD];

  private replicate: Replicate;

  constructor(apiToken?: string) {
    this.replicate = new Replicate({
      auth: apiToken || process.env.REPLICATE_API_TOKEN,
    });
  }

  async generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult> {
    const {
      text,
      voiceId,
      modelId = DEFAULT_NARRATION_MODEL,
      emotion = "neutral",
      languageBoost = "English",
      englishNormalization = true,
    } = params;

    const input = {
      text,
      voice_id: voiceId,
      emotion,
      language_boost: languageBoost,
      english_normalization: englishNormalization,
    };

    // Ensure modelId is in the correct format (owner/model or owner/model:version)
    const model = modelId as `${string}/${string}` | `${string}/${string}:${string}`;
    let output: { url: () => string };

    try {
      output = (await this.replicate.run(model, { input })) as { url: () => string };
    } catch (error) {
      throw mapReplicateErrorToMediaError({
        error,
        model: modelId,
        provider: this.name,
        context: "Replicate failed to generate audio",
        promptPreview: text.substring(0, 100),
      });
    }

    if (!output) {
      throw createMediaGenerationError({
        code: "PROVIDER_FAILURE",
        provider: this.name,
        model: modelId,
        message: "Replicate returned no audio output",
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
        model: modelId,
        message: `Failed to download audio (${response.statusText})`,
        isRetryable: false,
        userActionRequired: false,
      });
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Extract duration
    const duration = await extractAudioDuration(buffer);

    return { buffer, duration };
  }
}
