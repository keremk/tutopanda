import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderJobContext, SecretResolver } from '../../types.js';
import { createReplicateMusicHandler } from './replicate-music.js';

vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({
    run: vi.fn(),
  })),
}));

global.fetch = vi.fn();

const schemaText = JSON.stringify({
  type: 'object',
  required: ['prompt', 'duration'],
  properties: {
    prompt: { type: 'string' },
    duration: { type: 'integer', minimum: 1 },
  },
});

describe('replicate-music (schema-first, no fallbacks)', () => {
  let secretResolver: SecretResolver;
  type TestExtras = {
    resolvedInputs: Record<string, unknown>;
    jobContext: {
      inputBindings: Record<string, string>;
      sdkMapping: Record<string, { field: string; required?: boolean }>;
    };
    plannerContext: { index?: { segment?: number } };
    schema: { input: string };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    secretResolver = {
      async getSecret(key: string) {
        return key === 'REPLICATE_API_TOKEN' ? 'test-replicate-token' : null;
      },
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(4),
    });
  });

  function baseRequest(): ProviderJobContext {
    const extras: TestExtras = {
      resolvedInputs: {
        'Input:Prompt': 'Test music prompt',
        'Input:Duration': 8,
      },
      jobContext: {
        inputBindings: {
          Prompt: 'Input:Prompt',
          Duration: 'Input:Duration',
        },
        sdkMapping: {
          Prompt: { field: 'prompt', required: true },
          Duration: { field: 'duration', required: true },
        },
      },
      plannerContext: { index: { segment: 0 } },
      schema: { input: schemaText },
    };

    return {
      jobId: 'test-job',
      provider: 'replicate',
      model: 'stability-ai/stable-audio-2.5',
      revision: 'rev-test',
      layerIndex: 0,
      attempt: 1,
      inputs: Object.keys(extras.resolvedInputs),
      produces: ['Artifact:MusicTrack'],
      context: {
        providerConfig: {},
        extras,
      },
    };
  }

  function extrasFor(request: ProviderJobContext): TestExtras {
    return request.context.extras as TestExtras;
  }

  it('builds input strictly from sdk mapping and schema', async () => {
    const handler = createReplicateMusicHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const Replicate = (await import('replicate')).default;
    const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
    (Replicate as any).mockImplementation(() => ({ run: mockRun }));

    await handler.warmStart?.({ logger: undefined });
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(mockRun).toHaveBeenCalledWith('stability-ai/stable-audio-2.5', {
      input: {
        prompt: 'Test music prompt',
        duration: 8,
      },
    });
  });

  it('fails fast when schema is missing', async () => {
    const handler = createReplicateMusicHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    delete (request.context.extras as any).schema;

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Missing input schema/);
  });

  it('fails fast when required mapped input is absent', async () => {
    const handler = createReplicateMusicHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    delete extras.resolvedInputs['Input:Prompt'];

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Missing required input/);
  });

  it('fails when payload violates the input schema', async () => {
    const handler = createReplicateMusicHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    extras.resolvedInputs['Input:Duration'] = 0;

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Invalid input payload/);
  });

  it('ignores providerConfig defaults and customAttributes', async () => {
    const handler = createReplicateMusicHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    request.context.providerConfig = {
      defaults: { duration: 30 },
      customAttributes: { seed: 1, cfg_scale: 2 },
    };

    const Replicate = (await import('replicate')).default;
    const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
    (Replicate as any).mockImplementation(() => ({ run: mockRun }));

    await handler.warmStart?.({ logger: undefined });
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(mockRun).toHaveBeenCalledWith('stability-ai/stable-audio-2.5', {
      input: { prompt: 'Test music prompt', duration: 8 },
    });
  });

  it('validates required inputs in simulated mode (dry run)', async () => {
    const handler = createReplicateMusicHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        environment: 'local',
      },
      mode: 'simulated',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    delete extras.resolvedInputs['Input:Duration'];

    await expect(handler.invoke(request)).rejects.toThrow(/Missing required input/);
  });
});
