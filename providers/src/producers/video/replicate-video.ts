import { Buffer } from 'node:buffer';
import type { HandlerFactory } from '../../types.js';
import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import { createProviderError } from '../../sdk/errors.js';
import {
  createReplicateClientManager,
  normalizeReplicateOutput,
  buildArtefactsFromUrls,
  extractPlannerContext,
  mergeInputs,
  isRecord,
  type PlannerContext,
} from '../../sdk/replicate/index.js';

interface ReplicateVideoConfig {
  promptKey: string;
  imageKey?: string;
  negativePromptKey?: string;
  lastFrameKey?: string;
  defaults?: Record<string, unknown>;
  outputMimeType: string;
}

export function createReplicateVideoHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger } = init;
    const clientManager = createReplicateClientManager(secretResolver, logger);

    return createProducerHandlerFactory({
      domain: 'media',
      configValidator: parseReplicateVideoConfig,
      warmStart: async () => {
        try {
          await clientManager.ensure();
        } catch (error) {
          logger?.error?.('providers.replicate.video.warmStart.error', {
            provider: descriptor.provider,
            model: descriptor.model,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      invoke: async ({ request, runtime }) => {
        const replicate = await clientManager.ensure();
        const config = runtime.config.parse<ReplicateVideoConfig>(parseReplicateVideoConfig);

        const resolvedInputs = runtime.inputs.all();
        const plannerContext = extractPlannerContext(request);

        // Resolve required prompt
        const prompt = resolvePrompt(resolvedInputs, plannerContext);
        if (!prompt) {
          throw createProviderError('No prompt available for video generation.', {
            code: 'missing_prompt',
            kind: 'user_input',
            causedByUser: true,
          });
        }

        // Build input by merging defaults with customAttributes
        const providerConfig = request.context.providerConfig;
        const customAttributes =
          isRecord(providerConfig) && isRecord(providerConfig.customAttributes)
            ? (providerConfig.customAttributes as Record<string, unknown>)
            : undefined;
        const input = mergeInputs(config.defaults ?? {}, customAttributes);

        // Set required prompt
        input[config.promptKey] = prompt;

        // Optionally add image for image-to-video
        const image = resolveOptionalImage(resolvedInputs, plannerContext);
        if (image && config.imageKey) {
          // Convert Uint8Array to Buffer for Replicate SDK
          input[config.imageKey] = toBufferIfNeeded(image);
        }

        // Optionally add negative prompt
        const negativePrompt = resolveOptionalNegativePrompt(resolvedInputs, plannerContext);
        if (negativePrompt && config.negativePromptKey) {
          input[config.negativePromptKey] = negativePrompt;
        }

        // Optionally add last frame for interpolation
        const lastFrame = resolveOptionalLastFrame(resolvedInputs, plannerContext);
        if (lastFrame && config.lastFrameKey) {
          // Convert Uint8Array to Buffer for Replicate SDK
          input[config.lastFrameKey] = toBufferIfNeeded(lastFrame);
        }

        // Run Replicate prediction
        let predictionOutput: unknown;
        const modelIdentifier = request.model as
          | `${string}/${string}`
          | `${string}/${string}:${string}`;

        logger?.info?.('providers.replicate.video.invoke.start', {
          provider: descriptor.provider,
          model: request.model,
          jobId: request.jobId,
          hasImage: Boolean(image),
          hasNegativePrompt: Boolean(negativePrompt),
          hasLastFrame: Boolean(lastFrame),
        });

        try {
          predictionOutput = await replicate.run(modelIdentifier, { input });
        } catch (error) {
          logger?.error?.('providers.replicate.video.invoke.error', {
            provider: descriptor.provider,
            model: request.model,
            jobId: request.jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw createProviderError('Replicate video prediction failed.', {
            code: 'replicate_prediction_failed',
            kind: 'transient',
            retryable: true,
            raw: error,
          });
        }

        // Normalize output and build artefacts
        const outputUrls = normalizeReplicateOutput(predictionOutput);
        const artefacts = await buildArtefactsFromUrls({
          produces: request.produces,
          urls: outputUrls,
          mimeType: config.outputMimeType,
        });

        const status = artefacts.some((a) => a.status === 'failed') ? 'failed' : 'succeeded';

        logger?.info?.('providers.replicate.video.invoke.end', {
          provider: descriptor.provider,
          model: request.model,
          jobId: request.jobId,
          status,
          artefactCount: artefacts.length,
        });

        return {
          status,
          artefacts,
          diagnostics: {
            provider: 'replicate',
            model: request.model,
            input,
            outputUrls,
            plannerContext,
            hasImage: Boolean(image),
            hasNegativePrompt: Boolean(negativePrompt),
            hasLastFrame: Boolean(lastFrame),
            ...(outputUrls.length === 0 && { rawOutput: predictionOutput }),
          },
        };
      },
    })(init);
  };
}

function parseReplicateVideoConfig(raw: unknown): ReplicateVideoConfig {
  const source = isRecord(raw) ? raw : {};

  // Merge defaults from multiple sources
  const defaults: Record<string, unknown> = {
    ...(isRecord(source.defaults) ? source.defaults : {}),
    ...(isRecord(source.inputs) ? source.inputs : {}),
  };

  // Model-specific key mappings with sensible defaults
  const promptKey =
    typeof source.promptKey === 'string' && source.promptKey ? source.promptKey : 'prompt';
  const imageKey =
    typeof source.imageKey === 'string' && source.imageKey ? source.imageKey : 'image';
  const negativePromptKey =
    typeof source.negativePromptKey === 'string' && source.negativePromptKey
      ? source.negativePromptKey
      : 'negative_prompt';
  const lastFrameKey =
    typeof source.lastFrameKey === 'string' && source.lastFrameKey
      ? source.lastFrameKey
      : 'last_frame';

  // Fixed output type for video
  const outputMimeType = 'video/mp4';

  return {
    promptKey,
    imageKey,
    negativePromptKey,
    lastFrameKey,
    defaults,
    outputMimeType,
  };
}

function resolvePrompt(
  resolvedInputs: Record<string, unknown>,
  planner: PlannerContext,
): string | undefined {
  // Try TextToVideoPrompt first (for text-to-video)
  const textToVideoPrompt = resolvedInputs['TextToVideoPrompt'];
  const segmentIndex = planner.index?.segment ?? 0;

  // Handle array of prompts (for segments)
  if (Array.isArray(textToVideoPrompt) && textToVideoPrompt.length > 0) {
    const prompt = textToVideoPrompt[segmentIndex] ?? textToVideoPrompt[0];
    if (typeof prompt === 'string' && prompt.trim()) {
      return prompt;
    }
  }

  // Handle single string prompt
  if (typeof textToVideoPrompt === 'string' && textToVideoPrompt.trim()) {
    return textToVideoPrompt;
  }

  // Try ImageToVideoPrompt (for image-to-video)
  const imageToVideoPrompt = resolvedInputs['ImageToVideoPrompt'];

  // Handle array of prompts
  if (Array.isArray(imageToVideoPrompt) && imageToVideoPrompt.length > 0) {
    const prompt = imageToVideoPrompt[segmentIndex] ?? imageToVideoPrompt[0];
    if (typeof prompt === 'string' && prompt.trim()) {
      return prompt;
    }
  }

  // Handle single string prompt
  if (typeof imageToVideoPrompt === 'string' && imageToVideoPrompt.trim()) {
    return imageToVideoPrompt;
  }

  return undefined;
}

function resolveOptionalImage(
  resolvedInputs: Record<string, unknown>,
  planner: PlannerContext,
): string | Uint8Array | undefined {
  const imageInput = resolvedInputs['SegmentStartImage'];
  const segmentIndex = planner.index?.segment ?? 0;

  // Handle array of images (URLs or blobs)
  if (Array.isArray(imageInput) && imageInput.length > 0) {
    const image = imageInput[segmentIndex] ?? imageInput[0];
    if (typeof image === 'string' && image.trim()) {
      return image;
    }
    if (image instanceof Uint8Array) {
      return image;
    }
  }

  // Handle single string URL
  if (typeof imageInput === 'string' && imageInput.trim()) {
    return imageInput;
  }

  // Handle single Uint8Array blob
  if (imageInput instanceof Uint8Array) {
    return imageInput;
  }

  return undefined;
}

function resolveOptionalNegativePrompt(
  resolvedInputs: Record<string, unknown>,
  planner: PlannerContext,
): string | undefined {
  const negativePromptInput = resolvedInputs['NegativePrompt'];
  const segmentIndex = planner.index?.segment ?? 0;

  // Handle array of negative prompts
  if (Array.isArray(negativePromptInput) && negativePromptInput.length > 0) {
    const prompt = negativePromptInput[segmentIndex] ?? negativePromptInput[0];
    if (typeof prompt === 'string' && prompt.trim()) {
      return prompt;
    }
  }

  // Handle single string prompt
  if (typeof negativePromptInput === 'string' && negativePromptInput.trim()) {
    return negativePromptInput;
  }

  return undefined;
}

function resolveOptionalLastFrame(
  resolvedInputs: Record<string, unknown>,
  planner: PlannerContext,
): string | Uint8Array | undefined {
  const lastFrameInput = resolvedInputs['LastFrameImage'];
  const segmentIndex = planner.index?.segment ?? 0;

  // Handle array of images (URLs or blobs)
  if (Array.isArray(lastFrameInput) && lastFrameInput.length > 0) {
    const image = lastFrameInput[segmentIndex] ?? lastFrameInput[0];
    if (typeof image === 'string' && image.trim()) {
      return image;
    }
    if (image instanceof Uint8Array) {
      return image;
    }
  }

  // Handle single string URL
  if (typeof lastFrameInput === 'string' && lastFrameInput.trim()) {
    return lastFrameInput;
  }

  // Handle single Uint8Array blob
  if (lastFrameInput instanceof Uint8Array) {
    return lastFrameInput;
  }

  return undefined;
}

/**
 * Converts Uint8Array to Buffer for Replicate SDK.
 * The Replicate SDK expects Buffer objects for file uploads (as returned by fs.readFile).
 *
 * @param data String URL or Uint8Array blob
 * @returns String URL unchanged, or Buffer converted from Uint8Array
 */
function toBufferIfNeeded(data: string | Uint8Array): string | Buffer {
  if (typeof data === 'string') {
    return data;
  }
  // Convert Uint8Array to Buffer for Replicate SDK compatibility
  return Buffer.from(data);
}
