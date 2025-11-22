import { Buffer } from 'node:buffer';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
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
  runReplicateWithRetries,
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
    const { descriptor, secretResolver, logger, schemaRegistry } = init;
    const clientManager = createReplicateClientManager(secretResolver, logger, init.mode, schemaRegistry);

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
        const sdkPayload = runtime.sdk.buildPayload();

        const providerConfig = request.context.providerConfig;
        const customAttributes =
          isRecord(providerConfig) && isRecord(providerConfig.customAttributes)
            ? (providerConfig.customAttributes as Record<string, unknown>)
            : undefined;
        const input = mergeInputs(config.defaults ?? {}, customAttributes);
        Object.assign(input, sdkPayload);

        const canonicalPromptId = readCanonicalPromptId(request);
        const existingPrompt = input[config.promptKey];
        if (typeof existingPrompt !== 'string' || existingPrompt.trim().length === 0) {
          throw createProviderError(
            `No prompt available for video generation (missing canonical input "${canonicalPromptId}").`,
            {
              code: 'missing_prompt',
              kind: 'user_input',
              causedByUser: true,
              metadata: { canonicalPromptId },
            },
          );
        }
        input[config.promptKey] = existingPrompt;

        let hasImage = false;
        if (config.imageKey) {
          const currentImage = input[config.imageKey];
          if (typeof currentImage === 'string' || currentImage instanceof Uint8Array) {
            input[config.imageKey] = toBufferIfNeeded(currentImage);
            hasImage = true;
          } else {
            const fallbackImage = resolveOptionalImage(resolvedInputs, plannerContext);
            if (fallbackImage) {
              input[config.imageKey] = toBufferIfNeeded(fallbackImage);
              hasImage = true;
            }
          }
        }

        if (config.negativePromptKey && input[config.negativePromptKey] === undefined) {
          const negativePrompt = resolveOptionalNegativePrompt(resolvedInputs, plannerContext);
          if (negativePrompt) {
            input[config.negativePromptKey] = negativePrompt;
          }
        }
        const hasNegativePrompt = Boolean(config.negativePromptKey && input[config.negativePromptKey]);

        let hasLastFrame = false;
        if (config.lastFrameKey) {
          const currentLastFrame = input[config.lastFrameKey];
          if (typeof currentLastFrame === 'string' || currentLastFrame instanceof Uint8Array) {
            input[config.lastFrameKey] = toBufferIfNeeded(currentLastFrame);
            hasLastFrame = true;
          } else {
            const lastFrame = resolveOptionalLastFrame(resolvedInputs, plannerContext);
            if (lastFrame) {
              input[config.lastFrameKey] = toBufferIfNeeded(lastFrame);
              hasLastFrame = true;
            }
          }
        }

        const resolution = resolveResolution(resolvedInputs);
        const resolutionFieldName = getResolutionFieldName(request.model);
        if (resolution) {
          input[resolutionFieldName] = resolution;
        }

        const aspectRatio = resolveAspectRatio(resolvedInputs);
        const aspectRatioFieldName = getAspectRatioFieldName(request.model);
        if (aspectRatio) {
          input[aspectRatioFieldName] = aspectRatio;
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
          hasImage,
          hasNegativePrompt,
          hasLastFrame,
        });

        try {
          predictionOutput = await runReplicateWithRetries({
            replicate: {
              run: (id, opts) => replicate.run(id as `${string}/${string}` | `${string}/${string}:${string}`, opts),
            },
            modelIdentifier,
            input,
            logger: init.logger,
            jobId: request.jobId,
            model: request.model,
            plannerContext,
          });
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
          mode: init.mode,
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
          hasImage,
          hasNegativePrompt,
          hasLastFrame,
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

function readCanonicalPromptId(request: ProviderJobContext): string {
  const extras = request.context.extras;
  if (extras && typeof extras === 'object') {
    const jobContext = (extras as Record<string, unknown>).jobContext;
    if (jobContext && typeof jobContext === 'object') {
      const bindings = (jobContext as Record<string, unknown>).inputBindings;
      if (bindings && typeof bindings === 'object') {
        const mapped = (bindings as Record<string, string>).Prompt;
        if (typeof mapped === 'string' && mapped.length > 0) {
          return mapped;
        }
      }
    }
  }
  return 'Prompt';
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
function toBufferIfNeeded(data: string | Uint8Array | Buffer): string | Buffer {
  if (typeof data === 'string') {
    return data;
  }
  if (Buffer.isBuffer(data)) {
    return data;
  }
  return Buffer.from(data);
}

function resolveResolution(resolvedInputs: Record<string, unknown>): string | undefined {
  const resolutionInput = resolvedInputs['Resolution'];

  // Handle single string value (resolution is uniform across segments)
  if (typeof resolutionInput === 'string' && resolutionInput.trim()) {
    return resolutionInput;
  }

  return undefined;
}

function resolveAspectRatio(resolvedInputs: Record<string, unknown>): string | undefined {
  const aspectRatioInput = resolvedInputs['AspectRatio'];

  // Handle single string value (aspect ratio is uniform across segments)
  if (typeof aspectRatioInput === 'string' && aspectRatioInput.trim()) {
    return aspectRatioInput;
  }

  return undefined;
}

/**
 * Determine the resolution parameter name based on the model.
 * Currently all video models use 'resolution'.
 */
function getResolutionFieldName(model: string): string {
  // All current video models use 'resolution'
  return 'resolution';
}

/**
 * Determine the aspect ratio parameter name based on the model.
 * Currently all video models use 'aspect_ratio'.
 */
function getAspectRatioFieldName(model: string): string {
  // All current video models use 'aspect_ratio'
  return 'aspect_ratio';
}
