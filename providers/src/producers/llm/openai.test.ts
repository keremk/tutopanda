import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { JSONSchema7 } from 'ai';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createOpenAiLlmHandler } from './openai.js';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  responses: vi.fn(),
  createOpenAI: vi.fn(),
}));

vi.mock('@ai-sdk/openai', async () => {
  const actual = await vi.importActual<typeof import('@ai-sdk/openai')>('@ai-sdk/openai');
  return {
    ...actual,
    createOpenAI: mocks.createOpenAI,
  };
});

vi.mock('ai', async () => {
  const actual = await vi.importActual<typeof import('ai')>('ai');
  return {
    ...actual,
    generateText: (...args: unknown[]) => mocks.generateText(...args),
    generateObject: (...args: unknown[]) => mocks.generateObject(...args),
  };
});

const secretResolver = vi.fn<(key: string) => Promise<string>>(async () => 'test-key');

function buildHandler(): ReturnType<HandlerFactory> {
  const factory = createOpenAiLlmHandler();
  return factory({
    descriptor: {
      provider: 'openai',
      model: 'openai/gpt5',
      environment: 'local',
    },
    mode: 'live',
    secretResolver: {
      async getSecret(key: string) {
        return secretResolver(key);
      },
    },
    logger: undefined,
  });

  it('only initialises the OpenAI client once during warmStart + invoke', async () => {
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      produces: ['Artifact:MovieSummary'],
      context: {
        providerConfig: {
          systemPrompt: 'Summarise {{topic}}',
          responseFormat: { type: 'text' },
          artefactMapping: [
            { artefactId: 'Artifact:MovieSummary', output: 'inline' },
          ],
        },
        extras: {
          resolvedInputs: {
            topic: 'space',
          },
        },
      },
    });

    mocks.generateText.mockResolvedValueOnce({
      text: 'Placeholder text',
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      warnings: [],
      response: { id: 'resp', model: 'openai/gpt5', createdAt: '' },
    });

    await handler.invoke(request);

    expect(secretResolver).toHaveBeenCalledTimes(1);
    expect(mocks.createOpenAI).toHaveBeenCalledTimes(1);
  });

  it('throws when provider configuration is not an object', async () => {
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      context: {
        providerConfig: null,
      },
    });

    await expect(handler.invoke(request)).rejects.toThrow('OpenAI provider configuration must be an object.');
  });

  it('throws when artefact mapping is empty', async () => {
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      context: {
        providerConfig: {
          systemPrompt: 'Prompt',
          responseFormat: { type: 'text' },
          artefactMapping: [],
        },
      },
    });

    await expect(handler.invoke(request)).rejects.toThrow('artefactMapping must be a non-empty array.');
  });
}

function createJobContext(overrides: Partial<ProviderJobContext> = {}): ProviderJobContext {
  const baseContext: ProviderJobContext = {
    jobId: 'job-base',
    provider: 'openai',
    model: 'openai/gpt5',
    revision: 'rev-base',
    layerIndex: 0,
    attempt: 1,
    inputs: [],
    produces: ['Artifact:Default'],
    context: {
      providerConfig: {
        systemPrompt: 'System prompt',
        responseFormat: { type: 'text' as const },
        artefactMapping: [
          {
            artefactId: 'Artifact:Default',
            output: 'inline' as const,
          },
        ],
      },
      rawAttachments: [],
      observability: undefined,
      environment: 'local',
      extras: {
        resolvedInputs: {},
      },
    },
  };

  const overrideContext: Partial<ProviderJobContext['context']> = overrides.context ?? {};
  const baseExtras = (baseContext.context.extras ?? {}) as Record<string, unknown>;
  const overrideExtras = (overrideContext.extras ?? {}) as Record<string, unknown>;
  const baseResolvedInputs = (baseExtras.resolvedInputs as Record<string, unknown> | undefined) ?? {};
  const overrideResolvedInputs =
    (overrideExtras.resolvedInputs as Record<string, unknown> | undefined) ?? {};

  return {
    ...baseContext,
    ...overrides,
    context: {
      ...baseContext.context,
      ...overrideContext,
      providerConfig:
        overrideContext.providerConfig ?? baseContext.context.providerConfig,
      rawAttachments:
        overrideContext.rawAttachments ?? baseContext.context.rawAttachments,
      observability:
        overrideContext.observability ?? baseContext.context.observability,
      environment: overrideContext.environment ?? baseContext.context.environment,
      extras: {
        ...baseExtras,
        ...overrideExtras,
        resolvedInputs: {
          ...baseResolvedInputs,
          ...overrideResolvedInputs,
        },
      },
    },
  };
}

describe('createOpenAiLlmHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    secretResolver.mockClear();
    mocks.responses.mockReturnValue('mock-model');
    mocks.createOpenAI.mockReturnValue({
      responses: mocks.responses,
    });
    mocks.generateText.mockReset();
    mocks.generateObject.mockReset();
  });

  it('invokes OpenAI and maps artefacts from JSON response', async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        movie_title: 'Journey to Mars',
        narration: 'Once upon a time on Mars...',
      },
      usage: {
        inputTokens: 120,
        outputTokens: 350,
        totalTokens: 470,
      },
      warnings: [],
      response: {
        id: 'resp-123',
        model: 'openai/gpt5',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      jobId: 'job-1',
      revision: 'rev-001',
      produces: ['Artifact:MovieTitle', 'Artifact:NarrationScript'],
      context: {
        providerConfig: {
          systemPrompt: 'Write for {{audience}}',
          userPrompt: 'Topic: {{topic}}',
          variables: {
            audience: 'audience',
            topic: 'topic',
          },
          responseFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                movie_title: { type: 'string' },
                narration: { type: 'string' },
              },
            },
          },
          artefactMapping: [
            {
              field: 'movie_title',
              artefactId: 'Artifact:MovieTitle',
              output: 'inline',
            },
            {
              field: 'narration',
              artefactId: 'Artifact:NarrationScript',
              output: 'inline',
            },
          ],
        },
        rawAttachments: [],
        observability: undefined,
        environment: 'local',
        extras: {
          resolvedInputs: {
            audience: 'children',
            topic: 'space travel',
          },
        },
      },
    });

    const result = await handler.invoke(request);

    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
    expect(mocks.responses).toHaveBeenCalledWith('openai/gpt5');

    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    const callArgs = mocks.generateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs.prompt).toContain('Topic: space travel');
    expect(callArgs.model).toBe('mock-model');
    expect(callArgs.system).toBe('Write for children');
    expect(callArgs.mode).toBe('json');
    expect(callArgs.providerOptions).toMatchObject({
      openai: { strictJsonSchema: true },
    });
    const schemaWrapper = callArgs.schema as { jsonSchema: Record<string, unknown> };
    expect(schemaWrapper.jsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
    });

    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(2);
    expect(result.artefacts[0]).toMatchObject({
      artefactId: 'Artifact:MovieTitle',
      inline: 'Journey to Mars',
      status: 'succeeded',
    });
    expect(result.artefacts[1]?.inline).toContain('Once upon a time on Mars');
    expect(result.diagnostics?.response).toMatchObject({
      id: 'resp-123',
      model: 'openai/gpt5',
    });
  });

  it('marks artefacts as failed when mapping is missing', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: {},
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
      warnings: [],
      response: { id: 'resp-missing', model: 'openai/gpt5', createdAt: '' },
    });
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      jobId: 'job-2',
      revision: 'rev-002',
      produces: ['Artifact:Missing'],
      context: {
        providerConfig: {
          systemPrompt: 'Hello',
          responseFormat: { type: 'json_schema', schema: {} },
          artefactMapping: [
            { field: 'missing', artefactId: 'Artifact:Missing', output: 'inline' },
          ],
        },
        extras: {
          resolvedInputs: {},
        },
      },
    });

    const result = await handler.invoke(request);
    expect(result.status).toBe('failed');
    expect(result.artefacts[0]?.status).toBe('failed');
    expect(result.artefacts[0]?.diagnostics?.missingField).toBe('missing');
  });

  it('creates artefacts for structured schema with multiple properties', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: {
        summary: 'A short summary',
        title: 'An epic title',
      },
      usage: { inputTokens: 12, outputTokens: 24, totalTokens: 36 },
      warnings: [],
      response: { id: 'resp-structured', model: 'openai/gpt5', createdAt: '' },
    });

    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      jobId: 'job-structured',
      revision: 'rev-structured',
      produces: ['Artifact:MovieSummary', 'Artifact:MovieTitle'],
      context: {
        providerConfig: {
          systemPrompt: 'Provide summary and title.',
          responseFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                summary: { type: 'string' },
                title: { type: 'string' },
              },
            },
          },
          artefactMapping: [
            { field: 'summary', artefactId: 'Artifact:MovieSummary', output: 'inline' },
            { field: 'title', artefactId: 'Artifact:MovieTitle', output: 'inline' },
          ],
        },
        extras: { resolvedInputs: {} },
      },
    });

    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(2);
    expect(result.artefacts[0]?.inline).toBe('A short summary');
    expect(result.artefacts[1]?.inline).toBe('An epic title');

    const args = mocks.generateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    const schema = args.schema as { jsonSchema: Record<string, unknown> };
    expect(schema.jsonSchema).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: {
        summary: { type: 'string' },
        title: { type: 'string' },
      },
    });
  });

  it('produces inline artefacts for text responses', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: 'Plain response text',
      usage: {
        inputTokens: 10,
        outputTokens: 20,
        totalTokens: 30,
      },
      warnings: [],
      response: {
        id: 'resp-text',
        model: 'openai/gpt5',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });

    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      jobId: 'job-text',
      revision: 'rev-003',
      produces: ['Artifact:MovieSummary'],
      context: {
        providerConfig: {
          systemPrompt: 'Summarise {{topic}}',
          variables: { topic: 'topic' },
          responseFormat: { type: 'text' },
          artefactMapping: [
            {
              artefactId: 'Artifact:MovieSummary',
              output: 'inline',
            },
          ],
        },
        extras: {
          resolvedInputs: {
            topic: 'the ocean',
          },
        },
      },
    });

    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts[0]?.inline).toBe('Plain response text');

    const args = mocks.generateText.mock.calls[mocks.generateText.mock.calls.length - 1]?.[0] as Record<string, unknown>;
    expect(args.prompt).toContain('Summarise the ocean');
    expect(args.model).toBe('mock-model');
    expect(args.system).toBe('Summarise the ocean');
  });

  it('honours status overrides via statusField', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: {
        result: {
          prompt: 'Use this intro',
          status: 'failed',
        },
      },
      usage: {
        inputTokens: 15,
        outputTokens: 25,
        totalTokens: 40,
      },
      warnings: [],
      response: {
        id: 'resp-status',
        model: 'openai/gpt5',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });

    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = {
      jobId: 'job-status',
      provider: 'openai',
      model: 'openai/gpt5',
      revision: 'rev-004',
      layerIndex: 0,
      attempt: 1,
      inputs: [],
      produces: ['Artifact:NarrationScript'],
      context: {
        providerConfig: {
          systemPrompt: 'Return narration',
          responseFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                result: {
                  type: 'object',
                  properties: {
                    prompt: { type: 'string' },
                    status: { type: 'string' },
                  },
                },
              },
            },
          },
          artefactMapping: [
            {
              field: 'result.prompt',
              statusField: 'result.status',
              artefactId: 'Artifact:NarrationScript',
              output: 'inline',
            },
          ],
        },
        extras: {
          resolvedInputs: {},
        },
      },
    } satisfies ProviderJobContext;

    const result = await handler.invoke(request);
    expect(result.status).toBe('failed');
    expect(result.artefacts[0]?.status).toBe('failed');
    expect(result.artefacts[0]?.inline).toBe('Use this intro');
  });

  it('handles array properties when mapping structured outputs', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: {
        items: ['One', 'Two', 'Three'],
      },
      usage: {
        inputTokens: 18,
        outputTokens: 28,
        totalTokens: 46,
      },
      warnings: [],
      response: {
        id: 'resp-array',
        model: 'openai/gpt5',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });

    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = {
      jobId: 'job-array',
      provider: 'openai',
      model: 'openai/gpt5',
      revision: 'rev-array',
      layerIndex: 0,
      attempt: 1,
      inputs: [],
      produces: ['Artifact:MovieTitle'],
      context: {
        providerConfig: {
          systemPrompt: 'List three items.',
          responseFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                items: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
          artefactMapping: [
            {
              field: 'items',
              artefactId: 'Artifact:MovieTitle',
              output: 'inline',
            },
          ],
        },
        extras: {
          resolvedInputs: {},
        },
      },
    } satisfies ProviderJobContext;

    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts[0]?.inline).toBe('One\nTwo\nThree');
  });

  it('normalises nested schemas to disallow additional properties', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: {
        result: {
          details: {
            title: 'Nested Title',
            meta: { rating: 'PG' },
          },
        },
      },
      usage: {
        inputTokens: 30,
        outputTokens: 40,
        totalTokens: 70,
      },
      warnings: [],
      response: {
        id: 'resp-nested',
        model: 'openai/gpt5',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });

    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = {
      jobId: 'job-nested',
      provider: 'openai',
      model: 'openai/gpt5',
      revision: 'rev-nested',
      layerIndex: 0,
      attempt: 1,
      inputs: [],
      produces: ['Artifact:NestedTitle'],
      context: {
        providerConfig: {
          systemPrompt: 'Return nested object.',
          responseFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                result: {
                  type: 'object',
                  properties: {
                    details: {
                      type: 'object',
                      properties: {
                        title: { type: 'string' },
                        meta: {
                          type: 'object',
                          properties: {
                            rating: { type: 'string' },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          artefactMapping: [
            {
              field: 'result.details.title',
              artefactId: 'Artifact:NestedTitle',
              output: 'inline',
            },
          ],
        },
        extras: { resolvedInputs: {} },
      },
    } satisfies ProviderJobContext;

    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts[0]?.inline).toBe('Nested Title');

    const args = mocks.generateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    const schemaWrapper = args.schema as { jsonSchema: JSONSchema7 };
    const rootSchema = schemaWrapper.jsonSchema;
    expect(rootSchema.additionalProperties).toBe(false);

    const resultSchemaDef = rootSchema.properties?.result;
    if (!resultSchemaDef || typeof resultSchemaDef === 'boolean') {
      throw new Error('Expected result schema to be an object');
    }
    const resultSchema = resultSchemaDef as JSONSchema7;
    expect(resultSchema.additionalProperties).toBe(false);

    const detailsSchemaDef = resultSchema.properties?.details;
    if (!detailsSchemaDef || typeof detailsSchemaDef === 'boolean') {
      throw new Error('Expected details schema to be an object');
    }
    const detailsSchema = detailsSchemaDef as JSONSchema7;
    expect(detailsSchema.additionalProperties).toBe(false);

    const metaSchemaDef = detailsSchema.properties?.meta;
    if (!metaSchemaDef || typeof metaSchemaDef === 'boolean') {
      throw new Error('Expected meta schema to be an object');
    }
    const metaSchema = metaSchemaDef as JSONSchema7;
    expect(metaSchema.additionalProperties).toBe(false);
  });

  it('fails warm start when secret is missing', async () => {
    const failingHandlerFactory = createOpenAiLlmHandler();
    const handler = failingHandlerFactory({
      descriptor: { provider: 'openai', model: 'openai/gpt5', environment: 'local' },
      mode: 'live',
      secretResolver: { async getSecret() { return null; } },
      logger: undefined,
    });

    await expect(handler.warmStart?.({ logger: undefined })).rejects.toThrowError(
      /OPENAI_API_KEY/,
    );
  });
});
