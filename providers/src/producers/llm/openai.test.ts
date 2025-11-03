import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createOpenAiLlmHandler } from './openai.js';

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
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

vi.mock('ai', () => ({
  generateText: (...args: unknown[]) => mocks.generateText(...args),
}));

const secretResolver = {
  async getSecret() {
    return 'test-key';
  },
};

function buildHandler(): ReturnType<HandlerFactory> {
  const factory = createOpenAiLlmHandler();
  return factory({
    descriptor: {
      provider: 'openai',
      model: 'openai/gpt5',
      environment: 'local',
    },
    mode: 'live',
    secretResolver,
    logger: undefined,
  });
}

describe('createOpenAiLlmHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mocks.responses.mockReturnValue('mock-model');
    mocks.createOpenAI.mockReturnValue({
      responses: mocks.responses,
    });
    mocks.generateText.mockResolvedValue({
      text: JSON.stringify({
        movie_title: 'Journey to Mars',
        narration: 'Once upon a time on Mars...',
      }),
      experimental_output: {
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
  });

  it('invokes OpenAI and maps artefacts from JSON response', async () => {
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = {
      jobId: 'job-1',
      provider: 'openai',
      model: 'openai/gpt5',
      revision: 'rev-001',
      layerIndex: 0,
      attempt: 1,
      inputs: [],
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
    } satisfies ProviderJobContext;

    const result = await handler.invoke(request);

    expect(mocks.createOpenAI).toHaveBeenCalledWith({ apiKey: 'test-key' });
    expect(mocks.responses).toHaveBeenCalledWith('openai/gpt5');

    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    const callArgs = mocks.generateText.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArgs.system).toBe('Write for children');
    expect(callArgs.prompt).toBe('Topic: space travel');
    expect(callArgs.responseFormat).toEqual({
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          movie_title: { type: 'string' },
          narration: { type: 'string' },
        },
      },
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
    const handler = buildHandler();
    await handler.warmStart?.({ logger: undefined });

    const request = {
      jobId: 'job-2',
      provider: 'openai',
      model: 'openai/gpt5',
      revision: 'rev-002',
      layerIndex: 0,
      attempt: 1,
      inputs: [],
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
    } satisfies ProviderJobContext;

    const result = await handler.invoke(request);
    expect(result.status).toBe('failed');
    expect(result.artefacts[0]?.status).toBe('failed');
    expect(result.artefacts[0]?.diagnostics?.missingField).toBe('missing');
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
