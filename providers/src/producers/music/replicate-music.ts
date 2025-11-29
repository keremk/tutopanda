import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import { createProviderError } from '../../sdk/errors.js';
import {
  createReplicateClientManager,
  normalizeReplicateOutput,
  buildArtefactsFromUrls,
  mergeInputs,
  extractPlannerContext,
  isRecord,
  runReplicateWithRetries,
} from '../../sdk/replicate/index.js';
import { validatePayload } from '../../sdk/schema-validator.js';

interface ReplicateMusicConfig {
  promptKey: string;
  durationKey?: string;
  durationMultiplier?: number;
  maxDuration?: number;
  defaults?: Record<string, unknown>;
  outputMimeType: string;
}

export function createReplicateMusicHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger, schemaRegistry } = init;
    const clientManager = createReplicateClientManager(secretResolver, logger, init.mode, schemaRegistry);

    return createProducerHandlerFactory({
      domain: 'media',
      configValidator: parseReplicateMusicConfig,
      warmStart: async () => {
        try {
          await clientManager.ensure();
        } catch (error) {
          logger?.error?.('providers.replicate.music.warmStart.error', {
            provider: descriptor.provider,
            model: descriptor.model,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      invoke: async ({ request, runtime }) => {
        const replicate = await clientManager.ensure();
        const config = runtime.config.parse<ReplicateMusicConfig>(parseReplicateMusicConfig);

        const resolvedInputs = runtime.inputs.all();
        const plannerContext = extractPlannerContext(request);
        const sdkPayload = runtime.sdk.buildPayload();
        const inputSchema = readInputSchema(request);
        validatePayload(inputSchema, sdkPayload, 'input');

        const providerConfig = request.context.providerConfig;
        const customAttributes =
          isRecord(providerConfig) && isRecord(providerConfig.customAttributes)
            ? (providerConfig.customAttributes as Record<string, unknown>)
            : undefined;
        const input = mergeInputs(config.defaults ?? {}, customAttributes);
        Object.assign(input, sdkPayload);

        const promptFromSdk = input[config.promptKey];
        const prompt = typeof promptFromSdk === 'string' && promptFromSdk.trim().length > 0
          ? promptFromSdk
          : resolveMusicPrompt(resolvedInputs);
        if (!prompt) {
          throw createProviderError('No music prompt available for music generation.', {
            code: 'missing_music_prompt',
            kind: 'user_input',
            causedByUser: true,
          });
        }
        input[config.promptKey] = prompt;

        const duration = resolveDuration(resolvedInputs);
        if (duration === undefined) {
          throw createProviderError('No duration available for music generation.', {
            code: 'missing_duration',
            kind: 'user_input',
            causedByUser: true,
          });
        }

        if (config.durationKey) {
          const mappedDuration = capDuration(
            duration,
            config.durationMultiplier ?? 1,
            config.maxDuration,
          );
          input[config.durationKey] = mappedDuration;
        }

        // Run Replicate prediction
        let predictionOutput: unknown;
        const modelIdentifier = request.model as
          | `${string}/${string}`
          | `${string}/${string}:${string}`;

        logger?.info?.('providers.replicate.music.invoke.start', {
          provider: descriptor.provider,
          model: request.model,
          jobId: request.jobId,
          duration,
          mappedDuration: input[config.durationKey ?? 'duration'],
          plannerContext,
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
          logger?.error?.('providers.replicate.music.invoke.error', {
            provider: descriptor.provider,
            model: request.model,
            jobId: request.jobId,
            error: error instanceof Error ? error.message : String(error),
          });
          throw createProviderError('Replicate music prediction failed.', {
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

        logger?.info?.('providers.replicate.music.invoke.end', {
          provider: descriptor.provider,
          model: request.model,
          jobId: request.jobId,
          status,
          artefactCount: artefacts.length,
          plannerContext,
        });

        return {
          status,
          artefacts,
          diagnostics: {
            provider: 'replicate',
            model: request.model,
            input,
            outputUrls,
            duration,
            mappedDuration: input[config.durationKey ?? 'duration'],
            plannerContext,
            ...(outputUrls.length === 0 && { rawOutput: predictionOutput }),
          },
        };
      },
    })(init);
  };
}

function parseReplicateMusicConfig(raw: unknown): ReplicateMusicConfig {
  const source = isRecord(raw) ? raw : {};

  // Merge defaults from multiple sources
  const defaults: Record<string, unknown> = {
    ...(isRecord(source.defaults) ? source.defaults : {}),
    ...(isRecord(source.inputs) ? source.inputs : {}),
  };

  // Model-specific key with sensible default
  const promptKey =
    typeof source.promptKey === 'string' && source.promptKey ? source.promptKey : 'prompt';

  // Model-specific duration configuration
  // stability-ai/stable-audio-2.5 uses 'duration' in seconds (max 190)
  // elevenlabs/music uses 'music_length_ms' in milliseconds (max 300000)
  const durationKey =
    typeof source.durationKey === 'string' && source.durationKey
      ? source.durationKey
      : 'duration';

  const durationMultiplier =
    typeof source.durationMultiplier === 'number' ? source.durationMultiplier : 1;

  const maxDuration =
    typeof source.maxDuration === 'number' ? source.maxDuration : undefined;

  // Fixed output type for music
  const outputMimeType = 'audio/mpeg';

  return {
    promptKey,
    durationKey,
    durationMultiplier,
    maxDuration,
    defaults,
    outputMimeType,
  };
}

function resolveMusicPrompt(resolvedInputs: Record<string, unknown>): string | undefined {
  const canonicalId = 'Artifact:MusicPromptGenerator.MusicPrompt';
  const value = resolvedInputs[canonicalId];
  if (typeof value === 'string' && value.trim()) {
    return value;
  }
  return undefined;
}

function resolveDuration(resolvedInputs: Record<string, unknown>): number | undefined {
  const durationInput = resolvedInputs['Input:Duration'];

  // Handle single number value (music is per-movie, not per-segment)
  if (typeof durationInput === 'number' && durationInput > 0) {
    return durationInput;
  }

  return undefined;
}

/**
 * Apply duration multiplier and cap to model-specific maximum.
 *
 * @param duration Original duration from projectConfig (in seconds)
 * @param multiplier Conversion factor (1 for seconds, 1000 for milliseconds)
 * @param max Optional maximum duration in target units
 * @returns Duration in target units, capped if max is specified
 */
function capDuration(
  duration: number,
  multiplier: number,
  max: number | undefined,
): number {
  const converted = duration * multiplier;
  if (max !== undefined) {
    return Math.min(converted, max);
  }
  return converted;
}

function readInputSchema(request: ProviderJobContext): string | undefined {
  const extras = request.context.extras;
  if (!extras || typeof extras !== 'object') {
    return undefined;
  }
  const schema = (extras as Record<string, unknown>).schema;
  if (!schema || typeof schema !== 'object') {
    return undefined;
  }
  const input = (schema as Record<string, unknown>).input;
  return typeof input === 'string' ? input : undefined;
}
