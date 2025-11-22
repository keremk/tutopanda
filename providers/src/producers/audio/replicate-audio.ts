import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import type { HandlerFactory, ProviderJobContext, ProviderLogger } from '../../types.js';
import { createProviderError } from '../../sdk/errors.js';
import {
  createReplicateClientManager,
  normalizeReplicateOutput,
  buildArtefactsFromUrls,
  extractPlannerContext,
  mergeInputs,
  isRecord,
} from '../../sdk/replicate/index.js';

interface ReplicateAudioConfig {
  textKey: string;
  defaults?: Record<string, unknown>;
  outputMimeType: string;
}

export function createReplicateAudioHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger, schemaRegistry } = init;
    const clientManager = createReplicateClientManager(secretResolver, logger, init.mode, schemaRegistry);

    const factory = createProducerHandlerFactory({
      domain: 'media',
      configValidator: parseReplicateAudioConfig,
      warmStart: async () => {
        try {
          await clientManager.ensure();
        } catch (error) {
          logger?.error?.('providers.replicate.audio.warmStart.error', {
            provider: descriptor.provider,
            model: descriptor.model,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      invoke: async ({ request, runtime }) => {
        const replicate = await clientManager.ensure();
        const config = runtime.config.parse<ReplicateAudioConfig>(parseReplicateAudioConfig);
        const plannerContext = extractPlannerContext(request);
        const sdkPayload = runtime.sdk.buildPayload();
        const text = sdkPayload[config.textKey] as string | undefined;
        const voice = sdkPayload.voice_id ?? sdkPayload.voice;

        if (!text) {
          logger?.warn?.('providers.replicate.audio.missingText', {
            producer: request.jobId,
            keys: Object.keys(runtime.inputs.all()),
            plannerContext,
          });
          throw createProviderError('No text available for audio generation.', {
            code: 'missing_text',
            kind: 'user_input',
            causedByUser: true,
          });
        }

        // Build input by merging defaults with customAttributes
        const customAttributes = isRecord(request.context.providerConfig)
          ? (request.context.providerConfig as Record<string, unknown>).customAttributes
          : undefined;

        const input = mergeInputs(config.defaults ?? {}, customAttributes as Record<string, unknown> | undefined);
        Object.assign(input, sdkPayload);
        input[config.textKey] = text;

        // Map voice from input if provided (takes precedence over customAttributes)
        if (voice) {
          const voiceFieldName = getVoiceFieldName(request.model);
          if (!input[voiceFieldName]) {
            input[voiceFieldName] = voice;
          }
        }

        let predictionOutput: unknown;
        const modelIdentifier = request.model as `${string}/${string}` | `${string}/${string}:${string}`;

        try {
          predictionOutput = await runWithRetries({
            replicate: {
              run: (id, opts) => replicate.run(id as `${string}/${string}` | `${string}/${string}:${string}`, opts),
            },
            modelIdentifier,
            input,
            logger: init.logger,
            request,
            plannerContext,
          });
        } catch (error) {
          logger?.error?.('providers.replicate.audio.invoke.error', {
            producer: request.jobId,
            model: request.model,
            plannerContext,
            inputKeys: Object.keys(input),
            inputPreview: Object.fromEntries(Object.entries(input).slice(0, 5)),
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          });
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
          mode: init.mode,
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

function parseReplicateAudioConfig(raw: unknown): ReplicateAudioConfig {
  const source = isRecord(raw) ? raw : {};

  // Merge defaults
  const defaults: Record<string, unknown> = {
    ...(isRecord(source.defaults) ? source.defaults : {}),
    ...(isRecord(source.inputs) ? source.inputs : {}),
  };

  // Determine textKey based on model (minimax uses 'text', elevenlabs uses 'prompt')
  const textKey = typeof source.textKey === 'string' && source.textKey ? source.textKey : 'text';

  // Fixed output mime type for audio
  const outputMimeType = 'audio/mpeg';

  return {
    textKey,
    defaults,
    outputMimeType,
  };
}

/**
 * Determine the voice parameter name based on the model.
 * Different models use different parameter names:
 * - minimax models: 'voice_id'
 * - elevenlabs models: 'voice'
 */
function getVoiceFieldName(model: string): string {
  if (model.includes('elevenlabs')) {
    return 'voice';
  }
  // Default to minimax format
  return 'voice_id';
}

async function runWithRetries(args: {
  replicate: { run: (id: string, opts: { input: Record<string, unknown> }) => Promise<unknown> };
  modelIdentifier: string;
  input: Record<string, unknown>;
  logger?: ProviderLogger;
  request: { jobId: string; model: string };
  plannerContext: Record<string, unknown>;
  maxAttempts?: number;
  defaultRetryMs?: number;
}): Promise<unknown> {
  const {
    replicate,
    modelIdentifier,
    input,
    logger,
    request,
    plannerContext,
    maxAttempts = 3,
    defaultRetryMs = 10_000,
  } = args;

  let attempt = 0;
  let lastError: unknown;
  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      return await replicate.run(modelIdentifier, { input });
    } catch (error: unknown) {
      lastError = error;
      const status = parseStatus(error);
      const retryAfterSec = parseRetryAfterSeconds(error);
      const retryMs = retryAfterSec !== undefined ? (retryAfterSec + 1) * 1000 : defaultRetryMs;

      const isThrottled = status === 429 || /429|Too Many Requests/i.test(String(error ?? ''));
      const shouldRetry = isThrottled && attempt < maxAttempts;
      if (shouldRetry) {
        logger?.warn?.('providers.replicate.audio.retry', {
          producer: request.jobId,
          model: request.model,
          plannerContext,
          status,
          attempt,
          maxAttempts,
          retryAfterMs: retryMs,
          error: error instanceof Error ? error.message : String(error),
        });
        const before = Date.now();
        await new Promise((resolve) => setTimeout(resolve, retryMs));
        const waitedMs = Date.now() - before;
        logger?.info?.('providers.replicate.audio.retry.waited', {
          producer: request.jobId,
          model: request.model,
          plannerContext,
          attempt,
          waitedMs,
        });
        continue;
      }

      break;
    }
  }
  const message =
    'Replicate rate limit hit (429); retries exhausted. Lower concurrency, wait, or add credit.';
  throw createProviderError(message, {
    code: 'replicate_prediction_failed',
    kind: 'transient',
    retryable: true,
    raw: lastError,
  });
}

function parseStatus(error: unknown): number | undefined {
  const candidate =
    (error as any)?.status
    ?? (error as any)?.httpStatus
    ?? (error as any)?.response?.status
    ?? (error as any)?.body?.status;
  if (typeof candidate === 'number') {
    return candidate;
  }
  const message = String((error as any)?.message ?? error ?? '');
  const match = /status[:\s]+(\d{3})/i.exec(message) || /(\d{3})\s+Too Many Requests/i.exec(message);
  if (match) {
    return Number(match[1]);
  }
  if (/429/.test(message) || /Too Many Requests/i.test(message)) {
    return 429;
  }
  return undefined;
}

function parseRetryAfterSeconds(error: unknown): number | undefined {
  const bodyVal = (error as any)?.body?.retry_after;
  if (typeof bodyVal === 'number') {
    return bodyVal;
  }
  const message = (error as any)?.message ?? '';
  let match = /retry[_-]after['"]?\s*[:=]\s*(\d+)/i.exec(String(message));
  if (match) {
    return Number(match[1]);
  }
  match = /resets in ~(\d+)s/i.exec(String(message));
  if (match) {
    return Number(match[1]);
  }
  return undefined;
}
