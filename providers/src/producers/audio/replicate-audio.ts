import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createProviderError } from '../../sdk/errors.js';
import {
  createReplicateClientManager,
  normalizeReplicateOutput,
  buildArtefactsFromUrls,
  extractPlannerContext,
  runReplicateWithRetries,
} from '../../sdk/replicate/index.js';
import { validatePayload } from '../../sdk/schema-validator.js';

const OUTPUT_MIME_TYPE = 'audio/mpeg';

export function createReplicateAudioHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger, schemaRegistry } = init;
    const clientManager = createReplicateClientManager(secretResolver, logger, init.mode, schemaRegistry);

    const factory = createProducerHandlerFactory({
      domain: 'media',
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
        const plannerContext = extractPlannerContext(request);
        const inputSchema = readInputSchema(request);
        if (!inputSchema) {
          throw createProviderError('Missing input schema for Replicate audio provider.', {
            code: 'missing_input_schema',
            kind: 'unknown',
          });
        }

        const sdkPayload = runtime.sdk.buildPayload();
        validatePayload(inputSchema, sdkPayload, 'input');
        const input = { ...sdkPayload };

        let predictionOutput: unknown;
        const modelIdentifier = request.model as `${string}/${string}` | `${string}/${string}:${string}`;

        logger?.info?.('providers.replicate.audio.invoke.start', {
          provider: descriptor.provider,
          model: request.model,
          jobId: request.jobId,
          inputKeys: Object.keys(input),
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
          logger?.error?.('providers.replicate.audio.invoke.error', {
            provider: descriptor.provider,
            model: request.model,
            jobId: request.jobId,
            error: error instanceof Error ? error.message : String(error),
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
          mimeType: OUTPUT_MIME_TYPE,
          mode: init.mode,
        });

        const status = artefacts.some((artefact) => artefact.status === 'failed') ? 'failed' : 'succeeded';

        const diagnostics: Record<string, unknown> = {
          provider: 'replicate',
          model: request.model,
          input,
          outputUrls,
          plannerContext,
          ...(outputUrls.length === 0 && { rawOutput: predictionOutput }),
        };

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

// Retry logic shared across replicate producers lives in sdk/replicate/retry.ts.
