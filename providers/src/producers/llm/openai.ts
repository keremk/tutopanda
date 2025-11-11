import type { ArtefactEventStatus } from 'tutopanda-core';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import type { ProducerInvokeArgs, ProducerRuntime } from '../../sdk/types.js';
import {
  createOpenAiClientManager,
  parseOpenAiConfig,
  renderPrompts,
  buildPrompt,
  callOpenAi,
  buildArtefactsFromResponse,
  sanitizeResponseMetadata,
  type OpenAiLlmConfig,
} from '../../sdk/openai/index.js';

export function createOpenAiLlmHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger } = init;
    const clientManager = createOpenAiClientManager(secretResolver, logger);
    const consoleLogger = globalThis.console;

    const factory = createProducerHandlerFactory({
      domain: 'prompt',
      configValidator: parseOpenAiConfig,
      warmStart: async () => {
        try {
          await clientManager.ensure();
        } catch (error) {
          logger?.error?.('providers.openai.warmStart.error', {
            provider: descriptor.provider,
            model: descriptor.model,
            error: error instanceof Error ? error.message : String(error),
          });
          throw error;
        }
      },
      invoke: async (args: ProducerInvokeArgs) => {
        const { request, runtime } = args;

        // 1. Parse config
        const config = runtime.config.parse<OpenAiLlmConfig>(parseOpenAiConfig);
        const schemaInfo = config.responseFormat?.type === 'json_schema'
          ? {
              hasSchema: Boolean(config.responseFormat.schema),
              schema: config.responseFormat.schema,
            }
          : { hasSchema: false };
        const configLogPayload = {
          producer: request.jobId,
          provider: descriptor.provider,
          model: descriptor.model,
          responseFormat: config.responseFormat?.type,
          ...schemaInfo,
        };
        logger?.debug?.('providers.openai.config', configLogPayload);
        consoleLogger.log('[providers.openai.config]', configLogPayload);

        // 2. Get OpenAI client and model
        await clientManager.ensure();
        const model = clientManager.getModel(request.model);

        // 3. Render prompts with variable substitution
        const promptInputs = buildPromptVariablePayload(config.variables, runtime, request);
        const prompts = renderPrompts(config, promptInputs);
        const prompt = buildPrompt(prompts);
        const promptPayload = {
          systemPrompt: prompts.system,
          userPrompt: prompts.user,
        };
        const promptLogPayload = {
          producer: request.jobId,
          provider: descriptor.provider,
          model: descriptor.model,
          ...promptPayload,
        };
        logger?.debug?.('providers.openai.prompts', promptLogPayload);
        consoleLogger.log('[providers.openai.prompts]', promptLogPayload);

        // 4. Call OpenAI via AI SDK
        const generation = await callOpenAi({
          model,
          prompts,
          responseFormat: config.responseFormat,
          config,
        });

        // 5. Build artifacts using implicit mapping
        const artefacts = buildArtefactsFromResponse(generation.data, request.produces, {
          producerId: request.jobId,
        });

        // 6. Determine overall status
        const status: ArtefactEventStatus = artefacts.some((artefact) => artefact.status === 'failed')
          ? 'failed'
          : 'succeeded';

        // 7. Build diagnostics
        const textLength =
          typeof generation.data === 'string'
            ? generation.data.length
            : JSON.stringify(generation.data).length;

        const diagnostics = {
          provider: 'openai',
          model: request.model,
          response: sanitizeResponseMetadata(generation.response),
          usage: generation.usage,
          warnings: generation.warnings,
          textLength,
        } satisfies Record<string, unknown>;

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

function buildPromptVariablePayload(
  variables: string[] | undefined,
  runtime: ProducerRuntime,
  request: ProviderJobContext,
): Record<string, unknown> {
  if (!variables || variables.length === 0) {
    return runtime.inputs.all();
  }
  const inputBindings = extractInputBindings(request);
  const payload: Record<string, unknown> = {};
  for (const variable of variables) {
    const canonicalId = inputBindings?.[variable] ?? variable;
    const value = runtime.inputs.getByNodeId(canonicalId);
    if (value === undefined) {
      throw new Error(
        `[providers.openai.prompts] Missing resolved input for canonical id "${canonicalId}" (variable "${variable}")`,
      );
    }
    payload[variable] = value;
  }
  return payload;
}

function extractInputBindings(request: ProviderJobContext): Record<string, string> | undefined {
  const extras = request.context.extras;
  if (!extras || typeof extras !== 'object') {
    return undefined;
  }
  const jobContext = (extras as Record<string, unknown>).jobContext;
  if (!jobContext || typeof jobContext !== 'object') {
    return undefined;
  }
  const bindings = (jobContext as Record<string, unknown>).inputBindings;
  if (!bindings || typeof bindings !== 'object') {
    return undefined;
  }
  return bindings as Record<string, string>;
}
