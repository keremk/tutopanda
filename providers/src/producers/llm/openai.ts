import { Buffer } from 'node:buffer';
import { createOpenAI } from '@ai-sdk/openai';
import {
  generateObject,
  generateText,
  jsonSchema,
  type CallSettings,
  type JSONSchema7,
  type JSONValue,
} from 'ai';
import { readJsonPath } from 'tutopanda-core';
import type { ArtefactEventStatus, ProducedArtefact } from 'tutopanda-core';
import type { HandlerFactory } from '../../types.js';
import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import type { ProducerInvokeArgs } from '../../sdk/types.js';

type JsonObject = Record<string, unknown>;

interface OpenAiResponseFormat {
  type: 'json_schema' | 'text';
  schema?: JsonObject;
  name?: string;
  description?: string;
}

interface OpenAiArtefactMapping {
  field?: string;
  artefactId: string;
  output: 'inline' | 'blob';
  mediaType?: string;
  statusField?: string;
  kind?: string;
}

interface OpenAiLlmConfig {
  systemPrompt: string;
  userPrompt?: string;
  variables?: Record<string, string>;
  responseFormat: OpenAiResponseFormat;
  temperature?: number;
  maxOutputTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  artefactMapping: OpenAiArtefactMapping[];
  reasoning?: 'minimal' | 'low' | 'medium' | 'high';
}

export function createOpenAiLlmHandler(): HandlerFactory {
  return (init) => {
    const { descriptor, secretResolver, logger } = init;
    let client: ReturnType<typeof createOpenAI> | null = null;

    async function ensureClient(): Promise<ReturnType<typeof createOpenAI>> {
      if (client) {
        return client;
      }
      const apiKey = await secretResolver.getSecret('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required to use the OpenAI provider.');
      }
      client = createOpenAI({ apiKey });
      return client;
    }

    const factory = createProducerHandlerFactory({
      domain: 'prompt',
      configValidator: parseOpenAiConfig,
      warmStart: async () => {
        try {
          await ensureClient();
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
        const openai = await ensureClient();
        const { request, runtime } = args;
        const config = runtime.config.parse<OpenAiLlmConfig>(parseOpenAiConfig);
        const prompts = renderPrompts(config, runtime.inputs.all());
        const prompt = buildPrompt(prompts) || ' ';

        const callSettings: CallSettings = {
          temperature: config.temperature,
          maxOutputTokens: config.maxOutputTokens,
          presencePenalty: config.presencePenalty,
          frequencyPenalty: config.frequencyPenalty,
        };

        const openAiOptions: Record<string, JSONValue> = {};
        if (config.responseFormat.type === 'json_schema') {
          openAiOptions.strictJsonSchema = true;
        }
        if (config.reasoning) {
          openAiOptions.reasoningEffort = config.reasoning;
        }
        const providerOptions =
          Object.keys(openAiOptions).length > 0 ? { openai: openAiOptions } : undefined;

        const openAiModel = openai.responses(request.model);
        const baseCallOptions = {
          ...callSettings,
          ...(providerOptions ? { providerOptions } : {}),
        } as CallSettings & { providerOptions?: Record<string, Record<string, JSONValue>> };

        let baseText: string;
        let parsedPayload: JsonObject | undefined;
        let responseMeta: Record<string, unknown> | undefined;
        let usageMeta: Record<string, unknown> | undefined;
        let warningsMeta: unknown[] | undefined;

        if (config.responseFormat.type === 'json_schema') {
          const normalizedSchema = normalizeJsonSchema(config.responseFormat.schema as JSONSchema7, {
            title: config.responseFormat.name,
            description: config.responseFormat.description,
          });
          const schema = jsonSchema(normalizedSchema);
          const generation = await generateObject({
            ...baseCallOptions,
            model: openAiModel,
            prompt,
            system: prompts.system,
            schema,
            schemaName: config.responseFormat.name,
            schemaDescription: config.responseFormat.description,
            mode: 'json',
          });
          baseText = JSON.stringify(generation.object, null, 2);
          parsedPayload = generation.object as JsonObject;
          responseMeta = generation.response as Record<string, unknown> | undefined;
          usageMeta = generation.usage as Record<string, unknown> | undefined;
          warningsMeta = generation.warnings;
        } else {
          const generation = await generateText({
            ...baseCallOptions,
            model: openAiModel,
            prompt,
            system: prompts.system,
          });
          baseText = generation.text;
          responseMeta = generation.response as Record<string, unknown> | undefined;
          usageMeta = generation.usage as Record<string, unknown> | undefined;
          warningsMeta = generation.warnings;
        }

        const artefacts = config.artefactMapping.map((mapping) =>
          buildArtefact({
            mapping,
            parsedPayload,
            baseText,
            config,
          }),
        );

        const status: ArtefactEventStatus = artefacts.some((artefact) => artefact.status === 'failed')
          ? 'failed'
          : 'succeeded';

        const enrichedDiagnostics = {
          provider: 'openai',
          model: request.model,
          response: sanitizeResponseMetadata(responseMeta),
          usage: usageMeta,
          warnings: warningsMeta,
          textLength: baseText.length,
        } satisfies Record<string, unknown>;

        return {
          status,
          artefacts,
          diagnostics: enrichedDiagnostics,
        };
      },
    });

    return factory(init);
  };
}

function parseOpenAiConfig(raw: unknown): OpenAiLlmConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('OpenAI provider configuration must be an object.');
  }
  const config = raw as Record<string, unknown>;
  const systemPrompt = readString(config.systemPrompt, 'systemPrompt');
  const userPrompt = readOptionalString(config.userPrompt);

  const variables = readOptionalRecord(config.variables);

  const responseFormat = parseResponseFormat(config.responseFormat);
  const artefactMapping = parseArtefactMapping(config.artefactMapping);

  return {
    systemPrompt,
    userPrompt,
    variables,
    responseFormat,
    temperature: readOptionalNumber(config.temperature),
    maxOutputTokens: readOptionalNumber(config.maxOutputTokens),
    presencePenalty: readOptionalNumber(config.presencePenalty),
    frequencyPenalty: readOptionalNumber(config.frequencyPenalty),
    artefactMapping,
    reasoning: readOptionalReasoning(config.reasoning),
  };
}

function parseResponseFormat(raw: unknown): OpenAiResponseFormat {
  if (!raw || typeof raw !== 'object') {
    return { type: 'text' };
  }
  const format = raw as Record<string, unknown>;
  const type = readString(format.type, 'responseFormat.type') as 'json_schema' | 'text';
  if (type === 'json_schema') {
    const schema = format.schema;
    if (!schema || typeof schema !== 'object') {
      throw new Error('responseFormat.schema must be provided when type is "json_schema".');
    }
    return {
      type,
      schema: schema as JsonObject,
      name: readOptionalString(format.name),
      description: readOptionalString(format.description),
    };
  }
  return { type: 'text' };
}

function parseArtefactMapping(raw: unknown): OpenAiArtefactMapping[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('artefactMapping must be a non-empty array.');
  }
  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`artefactMapping[${index}] must be an object.`);
    }
    const mapping = item as Record<string, unknown>;
    const output = readString(mapping.output, `artefactMapping[${index}].output`);
    if (output !== 'inline' && output !== 'blob') {
      throw new Error(`artefactMapping[${index}].output must be "inline" or "blob".`);
    }
    const field = readOptionalString(mapping.field);
    const artefactId = readString(mapping.artefactId, `artefactMapping[${index}].artefactId`);
    const statusField = readOptionalString(mapping.statusField);
    const mediaType = readOptionalString(mapping.mediaType);
    const kind = readOptionalString(mapping.kind);
    return {
      field,
      artefactId,
      output,
      mediaType,
      statusField,
      kind,
    };
  });
}

function renderTemplate(
  template: string,
  variables: Record<string, string> | undefined,
  inputs: Record<string, unknown>,
): string {
  if (!variables) return template;
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_, key: string) => {
    const inputKey = variables[key.trim()];
    if (!inputKey) return '';
    const value = inputs[inputKey];
    return value == null ? '' : String(value);
  });
}

function buildArtefact(args: {
  mapping: OpenAiArtefactMapping;
  parsedPayload: unknown;
  baseText: string;
  config: OpenAiLlmConfig;
}): ProducedArtefact {
  const { mapping, parsedPayload, baseText, config } = args;
  const diagnostics: Record<string, unknown> = {
    field: mapping.field,
    kind: mapping.kind,
  };

  let status: ArtefactEventStatus = 'succeeded';
  let inline: string | undefined;
  let blob: ProducedArtefact['blob'];

  let sourceValue: unknown;

  if (config.responseFormat.type === 'json_schema') {
    if (mapping.field) {
      const result = readJsonPath(parsedPayload, mapping.field);
      if (result.exists) {
        sourceValue = result.value;
      } else {
        diagnostics.missingField = mapping.field;
        status = 'failed';
      }
    } else {
      sourceValue = parsedPayload;
    }
  } else {
    sourceValue = baseText;
  }

  if (mapping.statusField && config.responseFormat.type === 'json_schema') {
    const statusResult = readJsonPath(parsedPayload, mapping.statusField);
    if (statusResult.exists) {
      const statusValue = String(statusResult.value).toLowerCase();
      if (statusValue === 'failed') {
        status = 'failed';
      }
      diagnostics.statusField = {
        field: mapping.statusField,
        value: statusResult.value,
      };
    }
  }

  const materialized = materializeValue(sourceValue);
  if (!materialized.success) {
    status = 'failed';
    diagnostics.valueError = materialized.error;
  } else if (mapping.output === 'inline') {
    inline = materialized.text;
  } else {
    if (!mapping.mediaType) {
      status = 'failed';
      diagnostics.valueError = 'mediaType is required when output is "blob".';
    } else if (!materialized.buffer) {
      status = 'failed';
      diagnostics.valueError = 'No binary payload available for blob artefact.';
    } else {
      blob = {
        data: materialized.buffer,
        mimeType: mapping.mediaType,
      };
    }
  }

  return {
    artefactId: mapping.artefactId,
    status,
    inline,
    blob,
    diagnostics,
  };
}

function materializeValue(value: unknown): {
  success: boolean;
  text?: string;
  buffer?: Uint8Array | string;
  error?: string;
} {
  if (value == null) {
    return { success: false, error: 'Value is undefined or null.' };
  }

  // String value
  if (typeof value === 'string') {
    return { success: true, text: value, buffer: value };
  }

  // Array - join items with newlines
  if (Array.isArray(value)) {
    const text = value.map((item) => (item == null ? '' : String(item))).join('\n');
    return { success: true, text, buffer: text };
  }

  // Binary data
  if (value instanceof Uint8Array) {
    return { success: true, text: Buffer.from(value).toString('utf8'), buffer: value };
  }

  // Object or other - serialize to JSON
  try {
    const text = JSON.stringify(value, null, 2);
    return { success: true, text, buffer: text };
  } catch {
    return { success: false, error: 'Unable to serialize value to JSON.' };
  }
}

function sanitizeResponseMetadata(metadata: unknown): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const response = metadata as Record<string, unknown>;
  return {
    id: response.id,
    model: response.model,
    createdAt: response.createdAt ?? response.created_at,
  };
}

function renderPrompts(
  config: OpenAiLlmConfig,
  inputs: Record<string, unknown>,
): { system?: string; user?: string } {
  return {
    system: renderTemplate(config.systemPrompt, config.variables, inputs),
    user: config.userPrompt ? renderTemplate(config.userPrompt, config.variables, inputs) : undefined,
  };
}

function buildPrompt(rendered: { system?: string; user?: string }): string {
  return rendered.user?.trim() || rendered.system?.trim() || '';
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string.`);
  }
  return value;
}

function readOptionalString(value: unknown): string | undefined {
  return value == null ? undefined : String(value);
}

function readOptionalNumber(value: unknown): number | undefined {
  if (value == null) return undefined;
  const num = Number(value);
  if (Number.isNaN(num)) {
    throw new Error(`Expected numeric value, received ${value}`);
  }
  return num;
}

function readOptionalRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)])
  );
}

function readOptionalReasoning(value: unknown): OpenAiLlmConfig['reasoning'] {
  if (value == null) return undefined;
  const reasoning = String(value);
  const valid = ['minimal', 'low', 'medium', 'high'] as const;
  if (valid.includes(reasoning as typeof valid[number])) {
    return reasoning as OpenAiLlmConfig['reasoning'];
  }
  throw new Error(`Unsupported reasoning level "${reasoning}".`);
}

function normalizeJsonSchema(
  schema: JSONSchema7,
  meta?: { title?: string; description?: string },
): JSONSchema7 {
  const clone = deepClone(schema);

  function visit(node: JSONSchema7, isRoot: boolean): JSONSchema7 {
    const next: JSONSchema7 = { ...node };

    if (isRoot) {
      if (meta?.title && !next.title) {
        next.title = meta.title;
      }
      if (meta?.description && !next.description) {
        next.description = meta.description;
      }
    }

    const isObjectSchema =
      includesType(next.type, 'object') ||
      (!!next.properties && next.type === undefined);
    if (isObjectSchema) {
      if (next.additionalProperties === undefined) {
        next.additionalProperties = false;
      }
      if (next.properties) {
        next.properties = Object.fromEntries(
          Object.entries(next.properties).map(([key, value]) => [
            key,
            typeof value === 'boolean' ? value : visit(value, false),
          ]),
        );
      }
    }

    const isArraySchema =
      includesType(next.type, 'array') || Array.isArray(next.items) || !!next.items;
    if (isArraySchema && next.items) {
      if (Array.isArray(next.items)) {
        next.items = next.items.map((item) =>
          typeof item === 'boolean' ? item : visit(item, false),
        );
      } else if (typeof next.items !== 'boolean') {
        next.items = visit(next.items, false);
      }
    }

    if (next.oneOf) {
      next.oneOf = next.oneOf.map((entry) =>
        typeof entry === 'boolean' ? entry : visit(entry, false),
      );
    }
    if (next.anyOf) {
      next.anyOf = next.anyOf.map((entry) =>
        typeof entry === 'boolean' ? entry : visit(entry, false),
      );
    }
    if (next.allOf) {
      next.allOf = next.allOf.map((entry) =>
        typeof entry === 'boolean' ? entry : visit(entry, false),
      );
    }
    if (next.not && typeof next.not !== 'boolean') {
      next.not = visit(next.not, false);
    }

    if (next.definitions) {
      next.definitions = Object.fromEntries(
        Object.entries(next.definitions).map(([key, value]) => [
          key,
          typeof value === 'boolean' ? value : visit(value, false),
        ]),
      );
    }

    if (next.$defs) {
      next.$defs = Object.fromEntries(
        Object.entries(next.$defs).map(([key, value]) => [
          key,
          typeof value === 'boolean' ? value : visit(value, false),
        ]),
      );
    }

    return next;
  }

  return visit(clone, true);
}

function includesType(
  type: JSONSchema7['type'],
  expected: string
): boolean {
  if (!type) {
    return false;
  }
  if (Array.isArray(type)) {
    return type.some((t) => t === expected);
  }
  return type === expected;
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
