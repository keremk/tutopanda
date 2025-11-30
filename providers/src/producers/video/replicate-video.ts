import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import { createProviderError } from '../../sdk/errors.js';
import {
  createReplicateClientManager,
  normalizeReplicateOutput,
  buildArtefactsFromUrls,
  extractPlannerContext,
  runReplicateWithRetries,
} from '../../sdk/replicate/index.js';
import { validatePayload } from '../../sdk/schema-validator.js';

const OUTPUT_MIME_TYPE = 'video/mp4';

export function createReplicateVideoHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger, schemaRegistry } = init;
    const clientManager = createReplicateClientManager(secretResolver, logger, init.mode, schemaRegistry);

    return createProducerHandlerFactory({
      domain: 'media',
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
        const plannerContext = extractPlannerContext(request);
        const inputSchema = readInputSchema(request);
        if (!inputSchema) {
          throw createProviderError('Missing input schema for Replicate video provider.', {
            code: 'missing_input_schema',
            kind: 'unknown',
          });
        }

        const sdkPayload = runtime.sdk.buildPayload();
        validatePayload(inputSchema, sdkPayload, 'input');
        const input = { ...sdkPayload };

        // Run Replicate prediction
        let predictionOutput: unknown;
        const modelIdentifier = request.model as
          | `${string}/${string}`
          | `${string}/${string}:${string}`;

        logger?.info?.('providers.replicate.video.invoke.start', {
          provider: descriptor.provider,
          model: request.model,
          jobId: request.jobId,
          inputKeys: Object.keys(input),
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
          mimeType: OUTPUT_MIME_TYPE,
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
            ...(outputUrls.length === 0 && { rawOutput: predictionOutput }),
          },
        };
      },
    })(init);
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
