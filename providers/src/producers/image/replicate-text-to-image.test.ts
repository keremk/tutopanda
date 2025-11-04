import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HandlerFactory, ProviderJobContext } from '../../types.js';
import { createReplicateTextToImageHandler } from './replicate-text-to-image.js';

const replicateMocks = vi.hoisted(() => ({
  run: vi.fn(),
  constructor: vi.fn(),
}));

vi.mock('replicate', () => {
  return {
    default: vi.fn(() => {
      replicateMocks.constructor();
      return {
        run: replicateMocks.run,
      };
    }),
  };
});

const secretResolver = {
  getSecret: vi.fn(async () => 'test-replicate-token'),
};

const originalFetch = globalThis.fetch;

function stubFetch(buffer: Uint8Array) {
  const response = {
    ok: true,
    arrayBuffer: async () => buffer,
  };
  const stub = vi.fn(async () => response);
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = stub as unknown as typeof fetch;
  return stub;
}

function restoreFetch() {
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch;
}

function buildHandler(): ReturnType<HandlerFactory> {
  const factory = createReplicateTextToImageHandler();
  return factory({
    descriptor: {
      provider: 'replicate',
      model: 'bytedance/seedream-4',
      environment: 'local',
    },
    mode: 'live',
    secretResolver,
    logger: undefined,
  });
}

function createJobContext(overrides: Partial<ProviderJobContext> = {}): ProviderJobContext {
  const base: ProviderJobContext = {
    jobId: 'job-text-to-image',
    provider: 'replicate',
    model: 'bytedance/seedream-4',
    revision: 'rev-100',
    layerIndex: 0,
    attempt: 1,
    inputs: ['Input:SegmentImagePromptInput[segment=0][image=0]', 'Input:AspectRatio', 'Input:ImagesPerSegment'],
    produces: ['Artifact:SegmentImage[segment=0][image=0]'],
    context: {
      providerConfig: {
        defaults: {
          negative_prompt: 'blurry, distorted, watermark, low contrast',
          num_inference_steps: 4,
          guidance_scale: 3,
          size: '1K',
          image_input: [],
          max_images: 1,
          sequential_image_generation: 'disabled',
        },
        promptKey: 'prompt',
        negativePromptKey: 'negative_prompt',
        aspectRatioKey: 'aspect_ratio',
        imageCountKey: 'max_images',
        sizeKey: 'size',
        outputMimeType: 'image/png',
      },
      environment: 'local',
      rawAttachments: [],
      observability: undefined,
      extras: {
        plannerContext: {
          index: {
            segment: 0,
            image: 0,
          },
        },
        resolvedInputs: {
          SegmentImagePromptInput: ['A cinematic view of mountains at sunrise'],
          ImagesPerSegment: 1,
          AspectRatio: '16:9',
        },
      },
    },
  };

  return {
    ...base,
    ...overrides,
    context: {
      ...base.context,
      ...(overrides.context ?? {}),
      extras: {
        ...(base.context.extras ?? {}),
        ...(overrides.context?.extras ?? {}),
        resolvedInputs: {
          ...(base.context.extras?.resolvedInputs ?? {}),
          ...(overrides.context?.extras?.resolvedInputs ?? {}),
        },
      },
    },
  };
}

describe('createReplicateTextToImageHandler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    replicateMocks.run.mockReset();
    replicateMocks.constructor.mockReset();
    secretResolver.getSecret.mockClear();
    restoreFetch();
  });

  it('runs Replicate prediction and materialises artefact blobs', async () => {
    const handler = buildHandler();
    stubFetch(new TextEncoder().encode('binary-image-data'));
    replicateMocks.run.mockResolvedValueOnce(['https://example.com/image-1.png']);

    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext();
    const result = await handler.invoke(request);

    expect(secretResolver.getSecret).toHaveBeenCalledWith('REPLICATE_API_TOKEN');
    expect(replicateMocks.run).toHaveBeenCalledWith('bytedance/seedream-4', {
      input: expect.objectContaining({
        prompt: 'A cinematic view of mountains at sunrise',
        aspect_ratio: '16:9',
        max_images: 1,
        size: '1K',
      }),
    });

    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(1);
    const artefact = result.artefacts[0];
    expect(artefact?.status).toBe('succeeded');
    expect(artefact?.blob?.mimeType).toBe('image/png');
    expect(artefact?.blob?.data).toBeInstanceOf(Uint8Array);
    expect(result.diagnostics?.outputUrls).toEqual(['https://example.com/image-1.png']);
  });

  it('marks artefact as failed when Replicate returns no URLs', async () => {
    const handler = buildHandler();
    replicateMocks.run.mockResolvedValueOnce([]);
    stubFetch(new TextEncoder().encode('unreached'));
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext();
    const result = await handler.invoke(request);

    expect(result.status).toBe('failed');
    expect(result.artefacts[0]?.status).toBe('failed');
    expect(result.artefacts[0]?.diagnostics).toMatchObject({
      reason: 'missing_output',
    });
  });

  it('throws when prompt cannot be resolved', async () => {
    const handler = buildHandler();
    replicateMocks.run.mockResolvedValueOnce([]);
    await handler.warmStart?.({ logger: undefined });

    const request = createJobContext({
      context: {
        extras: {
          resolvedInputs: {
            SegmentImagePromptInput: [],
          },
        },
      },
    });

    await expect(handler.invoke(request)).rejects.toThrow('No prompt available for image generation.');
  });
});
