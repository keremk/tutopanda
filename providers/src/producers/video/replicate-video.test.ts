import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderJobContext, SecretResolver } from '../../types.js';
import { createReplicateVideoHandler } from './replicate-video.js';

vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({
    run: vi.fn(),
  })),
}));

global.fetch = vi.fn();

const schemaText = JSON.stringify({
  type: 'object',
  required: ['prompt'],
  properties: {
    prompt: { type: 'string' },
    aspect_ratio: { type: 'string' },
    resolution: { type: 'string' },
    duration: { type: 'integer', minimum: 1 },
  },
});

describe('replicate-video (schema-first, no fallbacks)', () => {
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
      arrayBuffer: async () => new ArrayBuffer(8),
    });
  });

  function baseRequest(): ProviderJobContext {
    const extras: TestExtras = {
      resolvedInputs: {
        'Input:Prompt': 'Test prompt',
      },
      jobContext: {
        inputBindings: {
          Prompt: 'Input:Prompt',
          AspectRatio: 'Input:AspectRatio',
          Resolution: 'Input:Resolution',
          Duration: 'Input:Duration',
        },
        sdkMapping: {
          Prompt: { field: 'prompt', required: true },
          AspectRatio: { field: 'aspect_ratio', required: false },
          Resolution: { field: 'resolution', required: false },
          Duration: { field: 'duration', required: false },
        },
      },
      plannerContext: { index: { segment: 0 } },
      schema: { input: schemaText },
    };

    return {
      jobId: 'test-job',
      provider: 'replicate',
      model: 'bytedance/seedance-1-pro-fast',
      revision: 'rev-test',
      layerIndex: 0,
      attempt: 1,
      inputs: ['Input:Prompt'],
      produces: ['Artifact:SegmentVideo[0]'],
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
    const handler = createReplicateVideoHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    extras.resolvedInputs['Input:AspectRatio'] = '16:9';
    extras.resolvedInputs['Input:Resolution'] = '720p';
    extras.resolvedInputs['Input:Duration'] = 6;

    const Replicate = (await import('replicate')).default;
    const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
    (Replicate as any).mockImplementation(() => ({ run: mockRun }));

    await handler.warmStart?.({ logger: undefined });
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
      input: {
        prompt: 'Test prompt',
        aspect_ratio: '16:9',
        resolution: '720p',
        duration: 6,
      },
    });
  });

  it('fails fast when schema is missing', async () => {
    const handler = createReplicateVideoHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
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
    const handler = createReplicateVideoHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
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
    const handler = createReplicateVideoHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    extras.resolvedInputs['Input:Duration'] = 'invalid-duration';
    extras.jobContext.sdkMapping.Duration = { field: 'duration', required: true };

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Invalid input payload/);
  });

  it('does not merge providerConfig defaults or customAttributes', async () => {
    const handler = createReplicateVideoHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    request.context.providerConfig = {
      defaults: { duration: 5, resolution: '1080p' },
      customAttributes: { fps: 24, camera_fixed: true },
    };

    const Replicate = (await import('replicate')).default;
    const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
    (Replicate as any).mockImplementation(() => ({ run: mockRun }));

    await handler.warmStart?.({ logger: undefined });
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
      input: { prompt: 'Test prompt' },
    });
  });

  it('propagates validation errors before calling Replicate', async () => {
    const handler = createReplicateVideoHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    extras.resolvedInputs['Input:Duration'] = 0; // violates minimum: 1
    extras.jobContext.sdkMapping.Duration = { field: 'duration', required: true };

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Invalid input payload/);
  });

  it('validates required inputs in simulated mode (dry run)', async () => {
    const handler = createReplicateVideoHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        environment: 'local',
      },
      mode: 'simulated',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    delete extras.resolvedInputs['Input:Prompt'];

    await expect(handler.invoke(request)).rejects.toThrow(/Missing required input/);
  });
});
