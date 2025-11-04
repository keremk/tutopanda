import { Buffer } from 'node:buffer';
import Replicate from 'replicate';
import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import type { ProducedArtefact } from 'tutopanda-core';
import { createProviderError } from '../../sdk/errors.js';

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

interface PlannerContext {
  index?: {
    segment?: number;
    image?: number;
  };
  [key: string]: unknown;
}

type JsonRecord = Record<string, unknown>;

export function createReplicateTextToImageHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger } = init;
    let client: Replicate | null = null;

    async function ensureClient(): Promise<Replicate> {
      if (client) {
        return client;
      }
      const token = await secretResolver.getSecret('REPLICATE_API_TOKEN');
      if (!token) {
        throw new Error('REPLICATE_API_TOKEN is required to use the Replicate provider.');
      }
      client = new Replicate({ auth: token });
      return client;
    }

    const factory = createProducerHandlerFactory({
      domain: 'media',
      configValidator: parseReplicateImageConfig,
      warmStart: async () => {
        try {
          await ensureClient();
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
        const replicate = await ensureClient();
        const config = runtime.config.parse<ReplicateImageConfig>(parseReplicateImageConfig);
        const resolvedInputs = runtime.inputs.all();
        const plannerContext = extractPlannerContext(request);
        const prompt = resolvePrompt(resolvedInputs, plannerContext);

        if (!prompt) {
          throw createProviderError('No prompt available for image generation.', {
            code: 'missing_prompt',
            kind: 'user_input',
            causedByUser: true,
          });
        }

        const input = buildReplicateInput({
          config,
          prompt,
          request,
          resolvedInputs,
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
        const artefacts = await buildArtefactsFromOutputs({
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

function extractPlannerContext(request: ProviderJobContext): PlannerContext {
  const extras = request.context.extras;
  const planner = extras && typeof extras === 'object' ? (extras as Record<string, unknown>).plannerContext : null;
  return planner && typeof planner === 'object' ? (planner as PlannerContext) : {};
}

function resolvePrompt(resolvedInputs: Record<string, unknown>, planner: PlannerContext): string | undefined {
  const promptInput = resolvedInputs['SegmentImagePromptInput'];
  const segmentIndex = planner.index?.segment ?? 0;
  const imageIndex = planner.index?.image ?? 0;
  const imagesPerSegment = resolvedInputs['ImagesPerSegment'];

  // Handle array of prompts
  if (Array.isArray(promptInput) && promptInput.length > 0) {
    // Try flat indexing if we have imagesPerSegment
    if (typeof imagesPerSegment === 'number' && imagesPerSegment > 0) {
      const flatIndex = segmentIndex * Math.trunc(imagesPerSegment) + imageIndex;
      const prompt = promptInput[flatIndex];
      if (typeof prompt === 'string' && prompt.trim()) {
        return prompt;
      }
    }

    // Fallback to simpler indexing
    const fallback = promptInput[imageIndex] ?? promptInput[segmentIndex] ?? promptInput[0];
    if (typeof fallback === 'string' && fallback.trim()) {
      return fallback;
    }
  }

  // Handle single string prompt
  if (typeof promptInput === 'string' && promptInput.trim()) {
    return promptInput;
  }

  // Fallback to inquiry prompt
  const inquiryPrompt = resolvedInputs['InquiryPrompt'];
  if (typeof inquiryPrompt === 'string' && inquiryPrompt.trim()) {
    return inquiryPrompt;
  }

  return undefined;
}

function buildReplicateInput(args: {
  config: ReplicateImageConfig;
  prompt: string;
  resolvedInputs: Record<string, unknown>;
  request: ProviderJobContext;
}): Record<string, unknown> {
  const { config, prompt, resolvedInputs, request } = args;
  const input: Record<string, unknown> = { ...config.defaults };

  // Set prompt
  input[config.promptKey] = prompt;

  // Set aspect ratio if provided
  const aspectRatio = resolvedInputs['AspectRatio'];
  if (typeof aspectRatio === 'string' && aspectRatio.trim()) {
    input[config.aspectRatioKey] = aspectRatio;
  }

  // Set size if provided
  if (config.sizeKey) {
    const size = resolvedInputs['Size'];
    if (typeof size === 'string' && size.trim()) {
      const sizeMapping: Record<string, string> = {
        '480p': '1K',
        '720p': '1K',
        '1080p': '1K',
      };
      input[config.sizeKey] = sizeMapping[size] ?? '1K';
    } else {
      input[config.sizeKey] ??= '1K';
    }
  }

  // Set image count
  const imagesPerSegment = resolvedInputs['ImagesPerSegment'];
  if (typeof imagesPerSegment === 'number' && imagesPerSegment > 0) {
    input[config.imageCountKey] = Math.min(request.produces.length, Math.trunc(imagesPerSegment));
  } else {
    input[config.imageCountKey] = request.produces.length;
  }

  // Map extra inputs
  for (const [inputKey, field] of Object.entries(config.extrasMapping)) {
    const value = resolvedInputs[inputKey];
    if (value !== undefined) {
      input[field] = value;
    }
  }

  return input;
}

function normalizeReplicateOutput(output: unknown): string[] {
  if (!output) {
    return [];
  }

  // Array of URLs or file objects
  if (Array.isArray(output)) {
    const urls: string[] = [];
    for (const item of output) {
      // Plain string URL
      if (typeof item === 'string' && item.length > 0) {
        urls.push(item);
      }
      // File object with url() method - Replicate SDK returns file objects with url() that returns URL objects
      else if (item && typeof item === 'object' && 'url' in item) {
        const obj = item as Record<string, unknown>;
        const urlProp = obj.url;
        const urlResult = typeof urlProp === 'function' ? (urlProp as () => unknown)() : urlProp;

        // Handle string URLs or URL objects (which have an href property)
        let urlString: string | undefined;
        if (typeof urlResult === 'string') {
          urlString = urlResult;
        } else if (urlResult && typeof urlResult === 'object' && 'href' in urlResult) {
          const href = (urlResult as Record<string, unknown>).href;
          urlString = typeof href === 'string' ? href : undefined;
        }

        if (urlString && urlString.length > 0) {
          urls.push(urlString);
        }
      }
    }
    return urls;
  }

  // Single string URL
  if (typeof output === 'string' && output.length > 0) {
    return [output];
  }

  // Single file object with url() method
  if (output && typeof output === 'object' && 'url' in output) {
    const obj = output as Record<string, unknown>;
    const urlProp = obj.url;
    const urlResult = typeof urlProp === 'function' ? (urlProp as () => unknown)() : urlProp;

    let urlString: string | undefined;
    if (typeof urlResult === 'string') {
      urlString = urlResult;
    } else if (urlResult && typeof urlResult === 'object' && 'href' in urlResult) {
      const href = (urlResult as Record<string, unknown>).href;
      urlString = typeof href === 'string' ? href : undefined;
    }

    if (urlString && urlString.length > 0) {
      return [urlString];
    }
  }

  return [];
}

async function buildArtefactsFromOutputs(args: {
  produces: string[];
  urls: string[];
  mimeType: string;
}): Promise<ProducedArtefact[]> {
  const artefacts: ProducedArtefact[] = [];
  for (let index = 0; index < args.produces.length; index += 1) {
    const artefactId = args.produces[index] ?? `Artifact:SegmentImage#${index}`;
    const url = args.urls[index];
    if (!url) {
      artefacts.push({
        artefactId,
        status: 'failed' as const,
        diagnostics: {
          reason: 'missing_output',
          index,
        },
      });
      continue;
    }

    try {
      const buffer = await downloadBinary(url);
      artefacts.push({
        artefactId,
        status: 'succeeded' as const,
        blob: {
          data: buffer,
          mimeType: args.mimeType,
        },
        diagnostics: {
          sourceUrl: url,
        },
      });
    } catch (error) {
      artefacts.push({
        artefactId,
        status: 'failed' as const,
        diagnostics: {
          reason: 'download_failed',
          url,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return artefacts;
}

async function downloadBinary(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url} (${response.status})`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
