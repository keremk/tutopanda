import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createOpenAiLlmHandler } from './openai.js';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  generateObject: vi.fn(),
  modelFn: vi.fn(),
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
        overrideContext.providerConfig !== undefined
          ? overrideContext.providerConfig
          : baseContext.context.providerConfig,
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
    mocks.modelFn.mockReturnValue('mock-model');
    mocks.createOpenAI.mockReturnValue(mocks.modelFn);
    mocks.generateText.mockReset();
    mocks.generateObject.mockReset();
  });

  it('only initializes the OpenAI client once during warmStart + invoke', async () => {
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      produces: ['Artifact:MovieSummary'],
      context: {
        providerConfig: {
          systemPrompt: 'Summarize',
          responseFormat: { type: 'text' },
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

    await expect(handler.invoke(request)).rejects.toThrow(
      'OpenAI provider configuration must be an object.',
    );
  });

  it('invokes OpenAI with implicit artifact mapping (camelCase to PascalCase)', async () => {
    mocks.generateObject.mockResolvedValue({
      object: {
        MovieTitle: 'Journey to Mars',
        MovieSummary: 'A thrilling space adventure',
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
      produces: ['Artifact:MovieTitle', 'Artifact:MovieSummary'],
      context: {
        providerConfig: {
          systemPrompt: 'Write for {{Audience}}',
          userPrompt: 'Topic: {{InquiryPrompt}}',
          variables: ['Audience', 'InquiryPrompt'],
          responseFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                MovieTitle: { type: 'string' },
                MovieSummary: { type: 'string' },
              },
            },
          },
        },
        extras: {
          resolvedInputs: {
            Audience: 'children',
            InquiryPrompt: 'space travel',
          },
        },
      },
    });

    const result = await handler.invoke(request);

    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
    expect(mocks.modelFn).toHaveBeenCalledWith('openai/gpt5');

    expect(mocks.generateObject).toHaveBeenCalledTimes(1);
    const callArgs = mocks.generateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs.prompt).toContain('Topic: space travel');
    expect(callArgs.model).toBe('mock-model');
    expect(callArgs.system).toBe('Write for children');
    expect(callArgs.mode).toBe('json');

    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(2);
    expect(result.artefacts[0]).toMatchObject({
      artefactId: 'Artifact:MovieTitle',
      inline: 'Journey to Mars',
      status: 'succeeded',
    });
    expect(result.artefacts[1]).toMatchObject({
      artefactId: 'Artifact:MovieSummary',
      inline: 'A thrilling space adventure',
      status: 'succeeded',
    });
  });

  it('handles array properties with segment indexing', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: {
        MovieTitle: 'The Great War',
        NarrationScript: ['Segment zero', 'Segment one', 'Segment two'],
      },
      usage: {
        inputTokens: 150,
        outputTokens: 420,
        totalTokens: 570,
      },
      warnings: [],
      response: {
        id: 'resp-script',
        model: 'openai/gpt5',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });

    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      produces: [
        'Artifact:MovieTitle',
        'Artifact:NarrationScript[segment=0]',
        'Artifact:NarrationScript[segment=1]',
        'Artifact:NarrationScript[segment=2]',
      ],
      context: {
        providerConfig: {
          systemPrompt: 'Create a lecture script',
          responseFormat: {
            type: 'json_schema',
            schema: {
              type: 'object',
              properties: {
                MovieTitle: { type: 'string' },
                NarrationScript: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
      },
    });

    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(4);

    const title = result.artefacts.find((a) => a.artefactId === 'Artifact:MovieTitle');
    expect(title?.inline).toBe('The Great War');

    const seg0 = result.artefacts.find((a) => a.artefactId === 'Artifact:NarrationScript[segment=0]');
    expect(seg0?.inline).toBe('Segment zero');

    const seg1 = result.artefacts.find((a) => a.artefactId === 'Artifact:NarrationScript[segment=1]');
    expect(seg1?.inline).toBe('Segment one');

    const seg2 = result.artefacts.find((a) => a.artefactId === 'Artifact:NarrationScript[segment=2]');
    expect(seg2?.inline).toBe('Segment two');
  });

  it('marks artefacts as failed when field is missing from JSON response', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: { MovieTitle: 'Title only' },
      usage: { inputTokens: 5, outputTokens: 10, totalTokens: 15 },
      warnings: [],
      response: { id: 'resp-missing', model: 'openai/gpt5', createdAt: '' },
    });
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      jobId: 'job-2',
      revision: 'rev-002',
      produces: ['Artifact:MovieTitle', 'Artifact:MissingField'],
      context: {
        providerConfig: {
          systemPrompt: 'Hello',
          responseFormat: { type: 'json_schema', schema: {} },
        },
      },
    });

    const result = await handler.invoke(request);
    expect(result.status).toBe('failed');
    expect(result.artefacts[0]?.status).toBe('succeeded');
    expect(result.artefacts[1]?.status).toBe('failed');
    expect(result.artefacts[1]?.diagnostics?.reason).toBe('missing_field');
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
          systemPrompt: 'Summarise {{InquiryPrompt}}',
          variables: ['InquiryPrompt'],
          responseFormat: { type: 'text' },
        },
        extras: {
          resolvedInputs: {
            InquiryPrompt: 'the ocean',
          },
        },
      },
    });

    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts[0]?.inline).toBe('Plain response text');

    const args = mocks.generateText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.prompt).toBe('Summarise the ocean');
    expect(args.model).toBe('mock-model');
    expect(args.system).toBe('Summarise the ocean');
  });

  it('substitutes prompt variables via input bindings when only canonical inputs exist', async () => {
    mocks.generateText.mockResolvedValueOnce({
      text: 'Prompt count acknowledged',
      usage: {
        inputTokens: 5,
        outputTokens: 6,
        totalTokens: 11,
      },
      warnings: [],
      response: {
        id: 'resp-bindings',
        model: 'openai/gpt5',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });

    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      produces: ['Artifact:ImagePromptGenerator.ImagePrompt[segment=0][image=0]'],
      context: {
        providerConfig: {
          systemPrompt: 'System prompt',
          userPrompt: 'Generate {{NumOfImagesPerNarrative}} prompts.',
          variables: ['NumOfImagesPerNarrative'],
          responseFormat: { type: 'text' },
        },
        extras: {
          resolvedInputs: {
            'Input:ImagePromptGenerator.NumOfImagesPerNarrative': 2,
          },
          jobContext: {
            inputBindings: {
              NumOfImagesPerNarrative: 'Input:ImagePromptGenerator.NumOfImagesPerNarrative',
            },
          },
        },
      },
    });

    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(1);

    const args = mocks.generateText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(args.prompt).toContain('Generate 2 prompts.');
    expect(args.system).toBe('System prompt');
  });

  it('normalizes TOML config from [prompt_settings] section', async () => {
    mocks.generateObject.mockResolvedValueOnce({
      object: {
        MovieTitle: 'The Battle',
        MovieSummary: 'A historic event',
      },
      usage: {
        inputTokens: 150,
        outputTokens: 420,
        totalTokens: 570,
      },
      warnings: [],
      response: {
        id: 'resp-toml',
        model: 'openai/gpt5',
        createdAt: '2025-01-01T00:00:00.000Z',
      },
    });

    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const schemaDefinition = {
      schema: {
        type: 'object',
        properties: {
          MovieTitle: { type: 'string' },
          MovieSummary: { type: 'string' },
        },
        required: ['MovieTitle', 'MovieSummary'],
      },
    };

    const request = createJobContext({
      produces: ['Artifact:MovieTitle', 'Artifact:MovieSummary'],
      context: {
        providerConfig: {
          prompt_settings: {
            textFormat: 'json_schema',
            jsonSchema: JSON.stringify(schemaDefinition),
            variables: ['Audience', 'Language'],
            systemPrompt: 'Teach {{Audience}} about {{Language}} history.',
          },
        },
        extras: {
          resolvedInputs: {
            Audience: 'kids',
            Language: 'English',
          },
        },
      },
    });

    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(2);

    const title = result.artefacts.find((artefact) => artefact.artefactId === 'Artifact:MovieTitle');
    expect(title?.inline).toBe('The Battle');

    const summary = result.artefacts.find((artefact) => artefact.artefactId === 'Artifact:MovieSummary');
    expect(summary?.inline).toBe('A historic event');

    const args = mocks.generateObject.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(typeof args.system).toBe('string');
    expect((args.system as string) ?? '').toContain('Teach kids about English history.');
  });

  it('fails warm start when secret is missing', async () => {
    const failingHandlerFactory = createOpenAiLlmHandler();
    const handler = failingHandlerFactory({
      descriptor: { provider: 'openai', model: 'openai/gpt5', environment: 'local' },
      mode: 'live',
      secretResolver: {
        async getSecret() {
          return null;
        },
      },
      logger: undefined,
    });

    await expect(handler.warmStart?.({ logger: undefined })).rejects.toThrowError(/OPENAI_API_KEY/);
  });
});
