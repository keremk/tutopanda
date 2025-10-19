import { generateImage } from "../image/image-generator";
import { generateAudio } from "../audio/audio-generator";
import { generateMusic } from "../music/music-generator";
import type { ImageConfig, ImageGenerationResult } from "../image/types";
import type { AudioConfig, AudioGenerationOutcome } from "../audio/types";
import type { MusicConfig, MusicGenerationOutcome } from "../music/types";
import type { Logger } from "./types";
import { isMediaGenerationError, createMediaGenerationError } from "./types";
import { DEFAULT_IMAGE_MODEL, DEFAULT_MUSIC_MODEL } from "@/lib/models";

/**
 * Options for batch processing with concurrency control
 */
export type BatchOptions = {
  maxConcurrency?: number;
  onBatchComplete?: (batchIndex: number, totalBatches: number) => void;
  onItemComplete?: (itemIndex: number, totalItems: number) => void | Promise<void>;
};

/**
 * Generic batch utility with concurrency control.
 * Processes items in batches to respect rate limits.
 *
 * @param items - Array of items to process
 * @param operation - Async operation to perform on each item
 * @param options - Batch processing options
 * @returns Array of results in the same order as items
 */
export async function batchWithConcurrency<T, R>(
  items: T[],
  operation: (item: T, index: number) => Promise<R>,
  options?: BatchOptions
): Promise<R[]> {
  const { maxConcurrency = 5, onBatchComplete, onItemComplete } = options || {};

  const results: R[] = [];
  const batches: T[][] = [];

  // Split items into batches
  for (let i = 0; i < items.length; i += maxConcurrency) {
    batches.push(items.slice(i, i + maxConcurrency));
  }

  // Process batches sequentially, items within batch in parallel
  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    const batchStartIndex = batchIndex * maxConcurrency;

    const batchResults = await Promise.all(
      batch.map(async (item, indexInBatch) => {
        const result = await operation(item, batchStartIndex + indexInBatch);
        await onItemComplete?.(batchStartIndex + indexInBatch + 1, items.length);
        return result;
      })
    );

    results.push(...batchResults);

    onBatchComplete?.(batchIndex + 1, batches.length);
  }

  return results;
}

/**
 * Request for throttled image generation
 */
export type ImageGenerationRequest = {
  prompt: string;
  config: ImageConfig;
};

/**
 * Generate multiple images with throttling.
 * Processes requests in batches to respect rate limits.
 *
 * @param requests - Array of image generation requests
 * @param options - Batch processing options with optional logger
 * @returns Array of image buffers
 */
export async function generateImagesThrottled(
  requests: ImageGenerationRequest[],
  options?: BatchOptions & { logger?: Logger }
): Promise<ImageGenerationResult[]> {
  const { logger, ...batchOptions } = options || {};

  return batchWithConcurrency(
    requests,
    async (request, index) => {
      logger?.info(`Generating image ${index + 1}/${requests.length}`);
      try {
        const buffer = await generateImage(request.prompt, request.config, { logger });
        return { ok: true, buffer } as ImageGenerationResult;
      } catch (error) {
        if (isMediaGenerationError(error)) {
          logger?.warn?.("Image generation skipped", {
            index,
            total: requests.length,
            code: error.code,
            message: error.message,
            providerCode: error.providerCode,
          });
          return { ok: false, error } as ImageGenerationResult;
        }

        const wrapped = createMediaGenerationError({
          code: "UNKNOWN",
          provider: "image",
          model: request.config.model || DEFAULT_IMAGE_MODEL,
          message: "Unexpected error during image generation",
          isRetryable: false,
          userActionRequired: false,
          cause: error,
        });

        logger?.error("Image generation failed", {
          index,
          total: requests.length,
          message: wrapped.message,
        });

        return { ok: false, error: wrapped } as ImageGenerationResult;
      }
    },
    batchOptions
  );
}

/**
 * Request for throttled audio generation
 */
export type AudioGenerationRequest = {
  text: string;
  config: AudioConfig;
};

/**
 * Generate multiple audio files with throttling.
 * Processes requests in batches to respect rate limits.
 *
 * @param requests - Array of audio generation requests
 * @param options - Batch processing options with optional logger
 * @returns Array of audio results (buffer + duration)
 */
export async function generateAudiosThrottled(
  requests: AudioGenerationRequest[],
  options?: BatchOptions & { logger?: Logger }
): Promise<AudioGenerationOutcome[]> {
  const { logger, ...batchOptions } = options || {};

  return batchWithConcurrency(
    requests,
    async (request, index) => {
      logger?.info(`Generating audio ${index + 1}/${requests.length}`);
      try {
        const audio = await generateAudio(request.text, request.config, { logger });
        return { ok: true, audio } as AudioGenerationOutcome;
      } catch (error) {
        if (isMediaGenerationError(error)) {
          logger?.warn?.("Audio generation skipped", {
            index,
            total: requests.length,
            code: error.code,
            message: error.message,
            providerCode: error.providerCode,
          });
          return { ok: false, error } as AudioGenerationOutcome;
        }

        const wrapped = createMediaGenerationError({
          code: "UNKNOWN",
          provider: "audio",
          model: request.config.model || "unknown",
          message: "Unexpected error during audio generation",
          isRetryable: false,
          userActionRequired: false,
          cause: error,
        });

        logger?.error("Audio generation failed", {
          index,
          total: requests.length,
          message: wrapped.message,
        });

        return { ok: false, error: wrapped } as AudioGenerationOutcome;
      }
    },
    batchOptions
  );
}

/**
 * Request for throttled music generation
 */
export type MusicGenerationRequest = {
  prompt: string;
  config: MusicConfig;
};

/**
 * Generate multiple music files with throttling.
 * Processes requests in batches to respect rate limits.
 *
 * @param requests - Array of music generation requests
 * @param options - Batch processing options with optional logger
 * @returns Array of music buffers
 */
export async function generateMusicsThrottled(
  requests: MusicGenerationRequest[],
  options?: BatchOptions & { logger?: Logger }
): Promise<MusicGenerationOutcome[]> {
  const { logger, ...batchOptions } = options || {};

  return batchWithConcurrency(
    requests,
    async (request, index) => {
      logger?.info(`Generating music ${index + 1}/${requests.length}`);
      try {
        const buffer = await generateMusic(request.prompt, request.config, { logger });
        return { ok: true, buffer } as MusicGenerationOutcome;
      } catch (error) {
        if (isMediaGenerationError(error)) {
          logger?.warn?.("Music generation skipped", {
            index,
            total: requests.length,
            code: error.code,
            message: error.message,
            providerCode: error.providerCode,
          });
          return { ok: false, error } as MusicGenerationOutcome;
        }

        const wrapped = createMediaGenerationError({
          code: "UNKNOWN",
          provider: "music",
          model: request.config.model || "unknown",
          message: "Unexpected error during music generation",
          isRetryable: false,
          userActionRequired: false,
          cause: error,
        });

        logger?.error("Music generation failed", {
          index,
          total: requests.length,
          message: wrapped.message,
        });

        return { ok: false, error: wrapped } as MusicGenerationOutcome;
      }
    },
    batchOptions
  );
}
