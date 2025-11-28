import { describe, expect, it, vi, beforeEach } from 'vitest';
import type {
  ProviderJobContext,
  SecretResolver,
} from '../../types.js';
import { createReplicateVideoHandler } from './replicate-video.js';

// Mock the Replicate SDK
vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({
    run: vi.fn(),
  })),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('replicate-video', () => {
  let secretResolver: SecretResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    secretResolver = {
      async getSecret(key: string) {
        if (key === 'REPLICATE_API_TOKEN') {
          return 'test-replicate-token';
        }
        return null;
      },
    };
  });

  type TestExtras = {
    resolvedInputs?: Record<string, unknown>;
    jobContext?: Record<string, any>;
    plannerContext?: { index?: Record<string, number> };
  };

  function attachCanonicalPrompt(
    request: ProviderJobContext,
    canonicalId: string,
    value: string,
    field = 'prompt',
  ) {
    const extras = (request.context.extras as TestExtras | undefined)
      ?? (request.context.extras = {} as TestExtras);
    const resolvedInputs = (extras.resolvedInputs = extras.resolvedInputs ?? {});
    resolvedInputs[canonicalId] = value;
    const jobContext = (extras.jobContext = extras.jobContext ?? {});
    jobContext.inputBindings = {
      ...(jobContext.inputBindings ?? {}),
      Prompt: canonicalId,
    };
    jobContext.sdkMapping = {
      ...(jobContext.sdkMapping ?? {}),
      Prompt: { field, required: true },
    };
  }

  function attachCanonicalPromptFromAlias(
    request: ProviderJobContext,
    alias: 'TextToVideoPrompt' | 'ImageToVideoPrompt',
    field = 'prompt',
  ) {
    const extras = (request.context.extras as TestExtras | undefined)
      ?? (request.context.extras = {} as TestExtras);
    const resolvedInputs = (extras.resolvedInputs = extras.resolvedInputs ?? {});
    const plannerContext = extras.plannerContext && typeof extras.plannerContext === 'object'
      ? extras.plannerContext
      : undefined;
    const segmentIndex = plannerContext?.index?.segment ?? 0;
    const source = resolvedInputs[alias];
    let value: string | undefined;
    if (Array.isArray(source)) {
      value = source[segmentIndex] ?? source[0];
    } else if (typeof source === 'string') {
      value = source;
    }
    if (typeof value !== 'string' || value.trim().length === 0) {
      throw new Error(`Test setup missing ${alias} value.`);
    }
    const canonicalId = alias === 'TextToVideoPrompt'
      ? 'Input:TextToVideoPrompt'
      : 'Input:ImageToVideoPrompt';
    request.inputs = request.inputs.map((input) => (input === alias ? canonicalId : input));
    attachCanonicalPrompt(request, canonicalId, value, field);
  }

  describe('config validation', () => {
    it('uses default promptKey when not specified', async () => {
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

      const promptValue = 'A beautiful sunset over mountains';
      const request: ProviderJobContext = {
        jobId: 'test-job-1',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {},
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPrompt(request, 'Input:TextToVideoPrompt', promptValue);

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.objectContaining({
          prompt: 'A beautiful sunset over mountains',
        }),
      });
    });

    it('uses custom promptKey when specified', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'custom-model',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const promptValue = 'Test video';
      const request: ProviderJobContext = {
        jobId: 'test-job-2',
        provider: 'replicate',
        model: 'custom-model',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            promptKey: 'description',
          },
          extras: {
            resolvedInputs: {},
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPrompt(request, 'Input:TextToVideoPrompt', promptValue, 'description');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('custom-model', {
        input: expect.objectContaining({
          description: 'Test video',
        }),
      });
    });

    it('sets outputMimeType to video/mp4', async () => {
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

      const promptValue = 'Test video';
      const request: ProviderJobContext = {
        jobId: 'test-job-3',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {},
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPrompt(request, 'Input:TextToVideoPrompt', promptValue);

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.artefacts[0]?.blob?.mimeType).toBe('video/mp4');
    });
  });

  describe('prompt resolution', () => {
    it('resolves TextToVideoPrompt from array', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-4',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[1]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: ['Prompt 1', 'Prompt 2', 'Prompt 3'],
            },
            plannerContext: { index: { segment: 1 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.objectContaining({
          prompt: 'Prompt 2',
        }),
      });
    });

    it('resolves TextToVideoPrompt from single string', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-5',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Single video prompt',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.objectContaining({
          prompt: 'Single video prompt',
        }),
      });
    });

    it('resolves ImageToVideoPrompt when TextToVideoPrompt is not available', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-6',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['ImageToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              ImageToVideoPrompt: 'Image to video prompt',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'ImageToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.objectContaining({
          prompt: 'Image to video prompt',
        }),
      });
    });

    it('throws error when no prompt is available', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-7',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: [],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {},
            plannerContext: { index: { segment: 0 } },
          },
        },
      };

      await handler.warmStart?.({ logger: undefined });
      await expect(handler.invoke(request)).rejects.toThrow(/canonical input/);
    });
  });

  describe('image input handling', () => {
    it('includes image when available for image-to-video', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-8',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['ImageToVideoPrompt', 'SegmentStartImage'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              ImageToVideoPrompt: 'Animate this image',
              SegmentStartImage: 'https://example.com/start-image.png',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'ImageToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.objectContaining({
          prompt: 'Animate this image',
          image: 'https://example.com/start-image.png',
        }),
      });
    });

    it('works without image for text-to-video', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-9',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Generate video from text',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.objectContaining({
          prompt: 'Generate video from text',
        }),
      });
      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.not.objectContaining({
          image: expect.anything(),
        }),
      });
    });
  });

  describe('optional parameters', () => {
    it('includes negative_prompt when available', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job-10',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt', 'NegativePrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'A beautiful landscape',
              NegativePrompt: 'blurry, distorted',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('google/veo-3.1-fast', {
        input: expect.objectContaining({
          prompt: 'A beautiful landscape',
          negative_prompt: 'blurry, distorted',
        }),
      });
    });

    it('includes last_frame when available', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job-11',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['ImageToVideoPrompt', 'SegmentStartImage', 'LastFrameImage'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              ImageToVideoPrompt: 'Transition between images',
              SegmentStartImage: 'https://example.com/start.png',
              LastFrameImage: 'https://example.com/end.png',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'ImageToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('google/veo-3.1-fast', {
        input: expect.objectContaining({
          prompt: 'Transition between images',
          image: 'https://example.com/start.png',
          last_frame: 'https://example.com/end.png',
        }),
      });
    });

    it('works without optional parameters', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job-12',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Simple video',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('google/veo-3.1-fast', {
        input: expect.objectContaining({
          prompt: 'Simple video',
        }),
      });
    });
  });

  describe('defaults and customAttributes merging', () => {
    it('merges defaults with customAttributes (customAttributes win)', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-13',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            defaults: {
              duration: 5,
              resolution: '720p',
              aspect_ratio: '16:9',
            },
            customAttributes: {
              duration: 10,
              fps: 24,
              camera_fixed: false,
            },
          },
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Test video',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      await handler.invoke(request);

      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.objectContaining({
          prompt: 'Test video',
          duration: 10, // customAttribute wins
          resolution: '720p', // from defaults
          aspect_ratio: '16:9', // from defaults
          fps: 24, // from customAttributes
          camera_fixed: false, // from customAttributes
        }),
      });
    });
  });

  describe('model-specific tests', () => {
    it('works with bytedance/seedance-1-lite', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'bytedance/seedance-1-lite',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job-14',
        provider: 'replicate',
        model: 'bytedance/seedance-1-lite',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            customAttributes: {
              duration: 5,
              resolution: '480p',
              aspect_ratio: '16:9',
              fps: 24,
            },
          },
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Lite model test',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-lite', {
        input: expect.objectContaining({
          prompt: 'Lite model test',
          duration: 5,
          resolution: '480p',
          aspect_ratio: '16:9',
          fps: 24,
        }),
      });
    });

    it('works with google/veo-3.1-fast with audio generation', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job-15',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            customAttributes: {
              duration: 8,
              resolution: '1080p',
              aspect_ratio: '16:9',
              generate_audio: true,
            },
          },
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Veo model test',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('google/veo-3.1-fast', {
        input: expect.objectContaining({
          prompt: 'Veo model test',
          duration: 8,
          resolution: '1080p',
          aspect_ratio: '16:9',
          generate_audio: true,
        }),
      });
    });
  });

  describe('Resolution and AspectRatio propagation', () => {
    it('maps Resolution from resolvedInputs to resolution field', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-resolution',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt', 'Input:Resolution', 'Input:AspectRatio'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Test video',
              Resolution: '720p',
              AspectRatio: '9:16',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-pro-fast', {
        input: expect.objectContaining({
          prompt: 'Test video',
          resolution: '720p',
          aspect_ratio: '9:16',
        }),
      });
    });

    it('Resolution and AspectRatio from resolvedInputs take precedence over customAttributes', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job-precedence',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt', 'Input:Resolution', 'Input:AspectRatio'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            customAttributes: {
              resolution: '480p',
              aspect_ratio: '16:9',
              duration: 8,
            },
          },
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Test video',
              Resolution: '1080p',
              AspectRatio: '1:1',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('google/veo-3.1-fast', {
        input: expect.objectContaining({
          prompt: 'Test video',
          resolution: '1080p', // from resolvedInputs, overrides customAttributes
          aspect_ratio: '1:1', // from resolvedInputs, overrides customAttributes
          duration: 8, // from customAttributes (not overridden)
        }),
      });
    });

    it('does not add resolution/aspect_ratio fields when Resolution/AspectRatio are not provided', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-no-resolution',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Test video',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      const callArgs = mockRun.mock.calls[0]?.[1] as { input: Record<string, unknown> };
      // Should only have prompt, not resolution or aspect_ratio
      expect(callArgs.input).toHaveProperty('prompt');
      expect(callArgs.input).not.toHaveProperty('resolution');
      expect(callArgs.input).not.toHaveProperty('aspect_ratio');
    });

    it('works with only Resolution provided (no AspectRatio)', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'bytedance/seedance-1-lite',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job-resolution-only',
        provider: 'replicate',
        model: 'bytedance/seedance-1-lite',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt', 'Input:Resolution'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Test video',
              Resolution: '480p',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('bytedance/seedance-1-lite', {
        input: expect.objectContaining({
          prompt: 'Test video',
          resolution: '480p',
        }),
      });
      const callArgs = mockRun.mock.calls[0]?.[1] as { input: Record<string, unknown> };
      expect(callArgs.input).not.toHaveProperty('aspect_ratio');
    });

    it('works with only AspectRatio provided (no Resolution)', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job-aspect-only',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt', 'Input:AspectRatio'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Test video',
              AspectRatio: '21:9',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(1024),
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('google/veo-3.1-fast', {
        input: expect.objectContaining({
          prompt: 'Test video',
          aspect_ratio: '21:9',
        }),
      });
      const callArgs = mockRun.mock.calls[0]?.[1] as { input: Record<string, unknown> };
      expect(callArgs.input).not.toHaveProperty('resolution');
    });
  });

  describe('error handling', () => {
    it('throws error when Replicate API fails', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-16',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Test video',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockRejectedValue(new Error('API Error'));
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      await handler.warmStart?.({ logger: undefined });
      await expect(handler.invoke(request)).rejects.toThrow(
        'Replicate video prediction failed',
      );
    });

    it('handles download failure gracefully', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job-17',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: 'Test video',
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };
      attachCanonicalPromptFromAlias(request, 'TextToVideoPrompt');

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/video.mp4');
      (Replicate as any).mockImplementation(() => ({ run: mockRun }));

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('failed');
      expect(result.artefacts[0]?.status).toBe('failed');
    });
  });
});
