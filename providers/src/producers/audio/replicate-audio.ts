import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
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
    const { descriptor, secretResolver, logger } = init;
    const clientManager = createReplicateClientManager(secretResolver, logger);

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
          console.warn('[providers.replicate.audio.missingText]', {
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
