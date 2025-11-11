import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createProviderError } from '../../sdk/errors.js';
import {
  createReplicateClientManager,
  normalizeReplicateOutput,
  buildArtefactsFromUrls,
  extractPlannerContext,
  isRecord,
  type PlannerContext,
} from '../../sdk/replicate/index.js';

interface ReplicateImageConfig {
  defaults: Record<string, unknown>;
  promptKey: string;
  negativePromptKey: string;
  aspectRatioKey: string;
  imageCountKey: string;
  sizeKey?: string;
  outputMimeType: string;
  extrasMapping: Record<string, string>;
}

export function createReplicateTextToImageHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger } = init;
    const clientManager = createReplicateClientManager(secretResolver, logger);

    const factory = createProducerHandlerFactory({
      domain: 'media',
      configValidator: parseReplicateImageConfig,
      warmStart: async () => {
        try {
          await clientManager.ensure();
        } catch (error) {
          logger?.error?.('providers.replicate.warmStart.error', {
            provider: descriptor.provider,
            model: descriptor.model,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      invoke: async ({ request, runtime }) => {
        const replicate = await clientManager.ensure();
        const config = runtime.config.parse<ReplicateImageConfig>(parseReplicateImageConfig);
        const plannerContext = extractPlannerContext(request);
        const sdkPayload = runtime.sdk.buildPayload();
        const promptValue = sdkPayload[config.promptKey];

        if (typeof promptValue !== 'string' || promptValue.trim().length === 0) {
          throw createProviderError('No prompt available for image generation.', {
            code: 'missing_prompt',
            kind: 'user_input',
            causedByUser: true,
          });
        }

        console.debug('[providers.replicate.image.prompt]', {
          producer: request.jobId,
          prompt: promptValue,
          availableInputs: Object.keys(runtime.inputs.all()),
          plannerContext,
        });

        const input = buildReplicateInput({
          config,
          request,
          basePayload: sdkPayload,
          prompt: promptValue,
          plannerContext,
          resolvedInputs: runtime.inputs.all(),
        });

        let predictionOutput: unknown;
        const modelIdentifier = request.model as `${string}/${string}` | `${string}/${string}:${string}`;

        try {
          predictionOutput = await replicate.run(modelIdentifier, { input });
        } catch (error) {
          throw createProviderError('Replicate prediction failed.', {
            code: 'replicate_prediction_failed',
            kind: 'transient',
            retryable: true,
            raw: error,
          });
        }

        const outputUrls = normalizeReplicateOutput(predictionOutput);
        const artefacts = await buildArtefactsFromUrls({
          produces: request.produces,
          urls: outputUrls,
          mimeType: config.outputMimeType,
        });

        const status = artefacts.some((artefact) => artefact.status === 'failed') ? 'failed' : 'succeeded';

        const diagnostics: Record<string, unknown> = {
          provider: 'replicate',
          model: request.model,
          input,
          outputUrls,
          plannerContext,
        };
        if (outputUrls.length === 0) {
          diagnostics.rawOutput = predictionOutput;
        }

        return {
          status,
          artefacts,
          diagnostics,
        };
      },
    });

    return factory(init);
  };
}

function parseReplicateImageConfig(raw: unknown): ReplicateImageConfig {
  const source = isRecord(raw) ? raw : {};

  // Merge all default sources
  const defaults: Record<string, unknown> = {
    ...(isRecord(source.defaults) ? source.defaults : {}),
    ...(isRecord(source.inputs) ? source.inputs : {}),
    ...(isRecord(source.customAttributes) ? source.customAttributes : {}),
  };

  // Extract key mappings with defaults
  const getString = (key: string, defaultValue: string): string =>
    typeof source[key] === 'string' && source[key] ? (source[key] as string) : defaultValue;

  const extrasMapping: Record<string, string> = {};
  if (isRecord(source.extrasMapping)) {
    for (const [key, value] of Object.entries(source.extrasMapping)) {
      if (typeof value === 'string' && value) {
        extrasMapping[key] = value;
      }
    }
  }

  return {
    defaults,
    promptKey: getString('promptKey', 'prompt'),
    negativePromptKey: getString('negativePromptKey', 'negative_prompt'),
    aspectRatioKey: getString('aspectRatioKey', 'aspect_ratio'),
    imageCountKey: getString('imageCountKey', 'num_outputs'),
    sizeKey: source.sizeKey && typeof source.sizeKey === 'string' ? source.sizeKey : undefined,
    outputMimeType: getString('outputMimeType', 'image/png'),
    extrasMapping,
  };
}

function buildReplicateInput(args: {
  config: ReplicateImageConfig;
  prompt: string;
  basePayload: Record<string, unknown>;
  request: ProviderJobContext;
  plannerContext: PlannerContext;
  resolvedInputs: Record<string, unknown>;
}): Record<string, unknown> {
  const { config, prompt, basePayload, request, plannerContext, resolvedInputs } = args;
  const input: Record<string, unknown> = {
    ...config.defaults,
    ...basePayload,
  };
  input[config.promptKey] = prompt;

  if (config.sizeKey && (input[config.sizeKey] === undefined || input[config.sizeKey] === '')) {
    input[config.sizeKey] = '1K';
  }

  const imagesPerSegment =
    runtimeNumber(resolvedInputs['ImagesPerSegment'])
    ?? runtimeNumber(resolvedInputs['NumOfImagesPerNarrative']);
  if (typeof imagesPerSegment === 'number' && imagesPerSegment > 0) {
    input[config.imageCountKey] = Math.min(request.produces.length, Math.trunc(imagesPerSegment));
  } else {
    input[config.imageCountKey] = request.produces.length;
  }

  const indexPayload = {
    segment: plannerContext.index?.segment ?? 0,
    image: plannerContext.index?.image ?? 0,
  };
  input._plannerIndex = indexPayload;

  for (const [inputKey, field] of Object.entries(config.extrasMapping)) {
    if (input[field] !== undefined) {
      continue;
    }
    const value = resolvedInputs[inputKey];
    if (value !== undefined) {
      input[field] = value;
    }
  }

  return input;
}

function runtimeNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
