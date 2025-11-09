import type { JSONSchema7 } from 'ai';

type JsonObject = Record<string, unknown>;

export interface OpenAiResponseFormat {
  type: 'json_schema' | 'text';
  schema?: JsonObject;
  name?: string;
  description?: string;
}

export interface OpenAiLlmConfig {
  systemPrompt: string;
  userPrompt?: string;
  variables?: string[];
  responseFormat: OpenAiResponseFormat;
  temperature?: number;
  maxOutputTokens?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  reasoning?: 'minimal' | 'low' | 'medium' | 'high';
}

export function parseOpenAiConfig(raw: unknown): OpenAiLlmConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error('OpenAI provider configuration must be an object.');
  }

  const normalized = normalizeOpenAiConfig(raw as Record<string, unknown>);
  const systemPrompt = readString(normalized.systemPrompt, 'systemPrompt');
  const userPrompt = readOptionalString(normalized.userPrompt);
  const variables = readOptionalStringArray(normalized.variables);
  const responseFormat = parseResponseFormat(normalized.responseFormat);

  return {
    systemPrompt,
    userPrompt,
    variables,
    responseFormat,
    temperature: readOptionalNumber(normalized.temperature),
    maxOutputTokens: readOptionalNumber(normalized.maxOutputTokens),
    presencePenalty: readOptionalNumber(normalized.presencePenalty),
    frequencyPenalty: readOptionalNumber(normalized.frequencyPenalty),
    reasoning: readOptionalReasoning(normalized.reasoning),
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

/**
 * Normalizes TOML/JSON config from various formats to a consistent structure.
 * Supports both [system_prompt] and [prompt_settings] sections for backward compatibility.
 */
function normalizeOpenAiConfig(source: Record<string, unknown>): Record<string, unknown> {
  const normalized: Record<string, unknown> = { ...source };

  // Handle legacy [system_prompt] or [prompt_settings] section
  const section = normalized.system_prompt ?? normalized.prompt_settings;
  if (isRecord(section)) {
    if (typeof section.systemPrompt === 'string') {
      normalized.systemPrompt = section.systemPrompt;
    }
    if (typeof section.userPrompt === 'string' && normalized.userPrompt === undefined) {
      normalized.userPrompt = section.userPrompt;
    }
    if (normalized.responseFormat === undefined) {
      const { responseFormat, reasoning } = normalizeResponseFormatFromSection(section);
      normalized.responseFormat = responseFormat;
      if (reasoning && normalized.reasoning === undefined) {
        normalized.reasoning = reasoning;
      }
    }
    if (normalized.variables === undefined && section.variables !== undefined) {
      normalized.variables = section.variables;
    }
    delete normalized.system_prompt;
    delete normalized.prompt_settings;
  }

  if (normalized.responseFormat === undefined) {
    normalized.responseFormat = { type: 'text' };
  }

  const hasTextFormat = typeof (normalized as Record<string, unknown>).textFormat === 'string';
  if (hasTextFormat) {
    const currentFormat = normalized.responseFormat as { type?: string } | undefined;
    const isDefaultTextFormat = !currentFormat || currentFormat.type === 'text';
    if (isDefaultTextFormat) {
      const pseudoSection: Record<string, unknown> = {
        textFormat: (normalized as Record<string, unknown>).textFormat,
      };
      if ((normalized as Record<string, unknown>).jsonSchema !== undefined) {
        pseudoSection.jsonSchema = (normalized as Record<string, unknown>).jsonSchema;
      }
      const { responseFormat, reasoning } = normalizeResponseFormatFromSection(pseudoSection);
      normalized.responseFormat = responseFormat;
      if (reasoning && normalized.reasoning === undefined) {
        normalized.reasoning = reasoning;
      }
    }
  }

  return normalized;
}

function normalizeResponseFormatFromSection(
  section: Record<string, unknown>,
): { responseFormat: Record<string, unknown>; reasoning?: string } {
  const rawFormat = typeof section.textFormat === 'string' ? section.textFormat.toLowerCase() : 'text';

  if (rawFormat === 'json_schema') {
    const schemaText = typeof section.jsonSchema === 'string' ? section.jsonSchema.trim() : '';
    if (!schemaText) {
      throw new Error('jsonSchema must be a non-empty string when textFormat is "json_schema".');
    }

    const schemaDefinition = parseJsonSchemaDefinition(schemaText);
    const responseFormat: Record<string, unknown> = {
      type: 'json_schema',
      schema: schemaDefinition.schema,
    };

    if (schemaDefinition.name) {
      responseFormat.name = schemaDefinition.name;
    }
    if (schemaDefinition.description) {
      responseFormat.description = schemaDefinition.description;
    }

    return {
      responseFormat,
      reasoning: schemaDefinition.reasoning,
    };
  }

  return { responseFormat: { type: 'text' } };
}

function parseJsonSchemaDefinition(schemaText: string): {
  schema: JsonObject;
  name?: string;
  description?: string;
  reasoning?: string;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(schemaText);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to parse jsonSchema: ${message}`);
  }

  if (!isRecord(parsed)) {
    throw new Error('jsonSchema must parse to an object.');
  }

  // Extract schema - supports both { schema: {...} } and direct schema
  const schema =
    isRecord(parsed.schema) && Object.keys(parsed.schema).length > 0
      ? (parsed.schema as JsonObject)
      : (parsed as JsonObject);

  return {
    schema,
    name: typeof parsed.name === 'string' ? parsed.name : undefined,
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : undefined,
  };
}

/**
 * Normalizes JSON schema to ensure compatibility with AI SDK.
 * Sets additionalProperties: false for object schemas if not specified.
 */
export function normalizeJsonSchema(
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
      includesType(next.type, 'object') || (!!next.properties && next.type === undefined);
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
        next.items = next.items.map((item) => (typeof item === 'boolean' ? item : visit(item, false)));
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

function includesType(type: JSONSchema7['type'], expected: string): boolean {
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

// Helper functions

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

function readOptionalStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return undefined;
}

function readOptionalReasoning(value: unknown): OpenAiLlmConfig['reasoning'] {
  if (value == null) return undefined;
  const reasoning = String(value);
  const valid = ['minimal', 'low', 'medium', 'high'] as const;
  if (valid.includes(reasoning as (typeof valid)[number])) {
    return reasoning as OpenAiLlmConfig['reasoning'];
  }
  throw new Error(`Unsupported reasoning level "${reasoning}".`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
