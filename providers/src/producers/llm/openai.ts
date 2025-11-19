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
  parseArtefactIdentifier,
  sanitizeResponseMetadata,
  type OpenAiLlmConfig,
  type GenerationResult,
} from '../../sdk/openai/index.js';

export function createOpenAiLlmHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger, schemaRegistry } = init;
    const clientManager = createOpenAiClientManager(secretResolver, logger, init.mode, schemaRegistry);
    const isSimulated = init.mode === 'simulated';
    const consoleLogger = globalThis.console;

    const factory = createProducerHandlerFactory({
      domain: 'prompt',
      configValidator: parseOpenAiConfig,
      warmStart: async () => {
        if (isSimulated) {
          return;
        }
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

        // 2. Render prompts with variable substitution
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

        // 3. Call OpenAI via AI SDK or simulate the response
        let generation: GenerationResult;
        if (isSimulated) {
          generation = simulateOpenAiGeneration(request, runtime, config, prompt);
        } else {
          await clientManager.ensure();
          const model = clientManager.getModel(request.model);
          generation = await callOpenAi({
            model,
            prompts,
            responseFormat: config.responseFormat,
            config,
          });
        }

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
    return normalizePromptValues(runtime.inputs.all(), runtime);
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
    payload[variable] = normalizePromptValue(value, runtime);
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

function normalizePromptValues(
  values: Record<string, unknown>,
  runtime: ProducerRuntime,
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(values)) {
    normalized[key] = normalizePromptValue(value, runtime);
  }
  return normalized;
}

function normalizePromptValue(value: unknown, runtime: ProducerRuntime): unknown {
  if (isFanInValue(value)) {
    return formatFanInPromptValue(value, runtime);
  }
  return value;
}

function formatFanInPromptValue(value: FanInValue, runtime: ProducerRuntime): string {
  const lines: string[] = [];
  for (const group of value.groups) {
    if (!Array.isArray(group)) {
      continue;
    }
    for (const memberId of group) {
      if (typeof memberId !== 'string' || memberId.length === 0) {
        continue;
      }
      const resolved = runtime.inputs.getByNodeId(memberId) ?? runtime.inputs.get(memberId);
      if (typeof resolved !== 'string' || resolved.trim().length === 0) {
        throw new Error(
          `[providers.openai.prompts] Fan-in member "${memberId}" is missing text content for prompt variable.`,
        );
      }
      lines.push(`- ${resolved.trim()}`);
    }
  }
  if (lines.length === 0) {
    throw new Error('[providers.openai.prompts] Fan-in collection did not yield any values for prompt variable.');
  }
  return lines.join('\n');
}

interface FanInValue {
  groupBy: string;
  orderBy?: string;
  groups: unknown[];
}

function isFanInValue(value: unknown): value is FanInValue {
  return Boolean(value && typeof value === 'object' && Array.isArray((value as FanInValue).groups));
}

function simulateOpenAiGeneration(
  request: ProviderJobContext,
  runtime: ProducerRuntime,
  config: OpenAiLlmConfig,
  compiledPrompt: string,
): GenerationResult {
  const subject = resolveSimulationSubject(runtime);
  const responseMeta = {
    id: `simulated-openai-${request.jobId}`,
    model: request.model,
    createdAt: new Date().toISOString(),
  } satisfies Record<string, unknown>;

  if (config.responseFormat?.type === 'json_schema') {
    const data = buildStructuredSimulationPayload(request, subject);
    return {
      data,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      warnings: [],
      response: responseMeta,
    } satisfies GenerationResult;
  }

  const text = buildSimulatedText(compiledPrompt, subject, request.jobId);
  return {
    data: text,
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    warnings: [],
    response: responseMeta,
  } satisfies GenerationResult;
}

function buildStructuredSimulationPayload(
  request: ProviderJobContext,
  subject: string,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  for (const artefactId of request.produces) {
    const parsed = parseArtefactIdentifier(artefactId);
    if (!parsed) {
      continue;
    }
    const fieldName = getBaseFieldName(parsed.kind);
    if (parsed.ordinal && parsed.ordinal.length > 0) {
      const label = describeSegmentValue(fieldName, subject, parsed.ordinal);
      payload[fieldName] = assignOrdinalValue(payload[fieldName], parsed.ordinal, label);
      continue;
    }
    if (parsed.index?.segment !== undefined) {
      const index = parsed.index.segment;
      const existing = Array.isArray(payload[fieldName]) ? (payload[fieldName] as unknown[]) : [];
      existing[index] = describeSegmentValue(fieldName, subject, [index]);
      payload[fieldName] = existing;
      continue;
    }
    payload[fieldName] = `Simulated ${fieldName} for ${subject}`;
  }
  return payload;
}

function buildSimulatedText(prompt: string, subject: string, jobId: string): string {
  const snippet = prompt.trim().replace(/\s+/g, ' ').slice(0, 160);
  const base = snippet.length > 0 ? snippet : subject;
  return `[Simulated ${jobId}] ${base}`;
}

function resolveSimulationSubject(runtime: ProducerRuntime): string {
  const candidates = runtime.inputs.all();
  const preferredKeys = ['Input:InquiryPrompt', 'InquiryPrompt', 'Input:Prompt', 'Prompt'];
  for (const key of preferredKeys) {
    const value = candidates[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  for (const value of Object.values(candidates)) {
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return 'simulation subject';
}

function getBaseFieldName(kind: string): string {
  return kind.includes('.') ? kind.slice(kind.lastIndexOf('.') + 1) : kind;
}

function assignOrdinalValue(existing: unknown, ordinal: number[], value: string): unknown[] {
  const root = Array.isArray(existing) ? (existing as unknown[]) : [];
  let cursor = root;
  for (let i = 0; i < ordinal.length; i += 1) {
    const index = ordinal[i]!;
    if (i === ordinal.length - 1) {
      cursor[index] = value;
      break;
    }
    if (!Array.isArray(cursor[index])) {
      cursor[index] = [];
    }
    cursor = cursor[index] as unknown[];
  }
  return root;
}

function describeSegmentValue(fieldName: string, subject: string, ordinal: number[]): string {
  const formatted = ordinal.map((value) => value + 1).join('.');
  return `Simulated ${fieldName} segment ${formatted} for ${subject}`;
}
