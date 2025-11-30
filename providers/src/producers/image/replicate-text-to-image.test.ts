import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderJobContext, SecretResolver } from '../../types.js';
import { createReplicateTextToImageHandler } from './replicate-text-to-image.js';

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
    output_size: { type: 'string' },
  },
});

describe('replicate-text-to-image (schema-first, no fallbacks)', () => {
  let secretResolver: SecretResolver;
  type TestExtras = {
    resolvedInputs: Record<string, unknown>;
    jobContext: {
      inputBindings: Record<string, string>;
      sdkMapping: Record<string, { field: string; required?: boolean }>;
    };
    plannerContext: { index?: { segment?: number; image?: number } };
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
        'Input:Prompt': 'A test image prompt',
        'Input:AspectRatio': '16:9',
      },
      jobContext: {
        inputBindings: {
          Prompt: 'Input:Prompt',
          AspectRatio: 'Input:AspectRatio',
        },
        sdkMapping: {
          Prompt: { field: 'prompt', required: true },
          AspectRatio: { field: 'aspect_ratio', required: false },
        },
      },
      plannerContext: { index: { segment: 0, image: 0 } },
      schema: { input: schemaText },
    };

    return {
      jobId: 'test-job',
      provider: 'replicate',
      model: 'bytedance/seedream-4',
      revision: 'rev-test',
      layerIndex: 0,
      attempt: 1,
      inputs: Object.keys(extras.resolvedInputs),
      produces: ['Artifact:SegmentImage[segment=0][image=0]'],
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
    const handler = createReplicateTextToImageHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedream-4',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    extras.resolvedInputs['Input:OutputSize'] = '1K';
    extras.jobContext.inputBindings.OutputSize = 'Input:OutputSize';
    extras.jobContext.sdkMapping.OutputSize = { field: 'output_size', required: false };

    const Replicate = (await import('replicate')).default;
    const mockRun = vi.fn().mockResolvedValue('https://example.com/image.png');
    (Replicate as any).mockImplementation(() => ({ run: mockRun }));

    await handler.warmStart?.({ logger: undefined });
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(mockRun).toHaveBeenCalledWith('bytedance/seedream-4', {
      input: {
        prompt: 'A test image prompt',
        aspect_ratio: '16:9',
        output_size: '1K',
      },
    });
  });

  it('fails fast when schema is missing', async () => {
    const handler = createReplicateTextToImageHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedream-4',
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
    const handler = createReplicateTextToImageHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedream-4',
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
    const handler = createReplicateTextToImageHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedream-4',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    extras.resolvedInputs['Input:AspectRatio'] = 42;

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Invalid input payload/);
  });

  it('ignores providerConfig defaults and customAttributes', async () => {
    const handler = createReplicateTextToImageHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedream-4',
        environment: 'local',
      },
      mode: 'live',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    request.context.providerConfig = {
      defaults: { output_size: '2K' },
      customAttributes: { negative_prompt: 'bad' },
    };

    const Replicate = (await import('replicate')).default;
    const mockRun = vi.fn().mockResolvedValue('https://example.com/image.png');
    (Replicate as any).mockImplementation(() => ({ run: mockRun }));

    await handler.warmStart?.({ logger: undefined });
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(mockRun).toHaveBeenCalledWith('bytedance/seedream-4', {
      input: {
        prompt: 'A test image prompt',
        aspect_ratio: '16:9',
      },
    });
  });

  it('validates required inputs in simulated mode (dry run)', async () => {
    const handler = createReplicateTextToImageHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedream-4',
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
