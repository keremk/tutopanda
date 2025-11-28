import { describe, expect, it } from 'vitest';
import { parseOpenAiConfig, normalizeJsonSchema } from './config.js';

describe('parseOpenAiConfig', () => {
  it('throws when responseFormat type is json_schema but schema is missing', () => {
    expect(() => parseOpenAiConfig({
      systemPrompt: 'test system',
      responseFormat: { type: 'json_schema' },
    })).toThrow(/schema/i);
  });

  it('unwraps nested schema objects during normalization', () => {
    const rawSchema = {
      schema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
        },
        required: ['title'],
      },
    };

    const normalized = normalizeJsonSchema(rawSchema as any);
    expect(normalized.type).toBe('object');
    expect(normalized.properties?.title).toBeDefined();
    expect(normalized.additionalProperties).toBe(false);
  });
});
