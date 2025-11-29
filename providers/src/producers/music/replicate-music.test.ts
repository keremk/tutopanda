import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createReplicateMusicHandler } from './replicate-music.js';
import type { ProviderJobContext, SecretResolver } from '../../types.js';

// Mock the Replicate SDK
vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({
    run: vi.fn(),
  })),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('createReplicateMusicHandler', () => {
  let secretResolver: SecretResolver;

  beforeEach(() => {
    vi.clearAllMocks();
    secretResolver = {
      async getSecret(key: string) {
        if (key === 'REPLICATE_API_TOKEN') {
          return 'test-token';
        }
        return null;
      },
    };
  });

  describe('stability-ai/stable-audio-2.5', () => {
    it('generates music with duration in seconds', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            durationKey: 'duration',
            durationMultiplier: 1,
            maxDuration: 190,
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Upbeat electronic music with a modern feel',
              'Input:Duration': 60,
            },
          },
        },
      };

      const testData = new Uint8Array([1, 2, 3]);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => testData.buffer,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('stability-ai/stable-audio-2.5', {
        input: expect.objectContaining({
          prompt: 'Upbeat electronic music with a modern feel',
          duration: 60,
        }),
      });
    });


    it('caps duration at 190 seconds', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            durationKey: 'duration',
            durationMultiplier: 1,
            maxDuration: 190,
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Epic orchestral soundtrack',
              'Input:Duration': 300, // Exceeds max
            },
          },
        },
      };

      const testData = new Uint8Array([1, 2, 3]);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => testData.buffer,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('stability-ai/stable-audio-2.5', {
        input: expect.objectContaining({
          duration: 190, // Capped
        }),
      });
    });

    it('merges defaults and customAttributes', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            durationKey: 'duration',
            durationMultiplier: 1,
            maxDuration: 190,
            defaults: {
              steps: 8,
              cfg_scale: 1,
            },
            customAttributes: {
              steps: 12,
              cfg_scale: 2,
            },
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Calm ambient music',
              'Input:Duration': 120,
            },
          },
        },
      };

      const testData = new Uint8Array([1, 2, 3]);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => testData.buffer,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('stability-ai/stable-audio-2.5', {
        input: expect.objectContaining({
          prompt: 'Calm ambient music',
          duration: 120,
          steps: 12, // customAttributes override
          cfg_scale: 2, // customAttributes override
        }),
      });
    });
  });

  describe('elevenlabs/music', () => {
    it('generates music with duration in milliseconds', async () => {
      const handler = createReplicateMusicHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'elevenlabs/music',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'elevenlabs/music',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            durationKey: 'music_length_ms',
            durationMultiplier: 1000,
            maxDuration: 300000,
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Jazzy piano piece',
              'Input:Duration': 60,
            },
          },
        },
      };

      const testData = new Uint8Array([1, 2, 3]);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => testData.buffer,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('elevenlabs/music', {
        input: expect.objectContaining({
          prompt: 'Jazzy piano piece',
          music_length_ms: 60000, // 60s * 1000
        }),
      });
    });

    it('caps duration at 300000 milliseconds (300s)', async () => {
      const handler = createReplicateMusicHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'elevenlabs/music',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'elevenlabs/music',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            durationKey: 'music_length_ms',
            durationMultiplier: 1000,
            maxDuration: 300000,
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Rock anthem',
              'Input:Duration': 400, // Exceeds max when converted
            },
          },
        },
      };

      const testData = new Uint8Array([1, 2, 3]);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => testData.buffer,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('elevenlabs/music', {
        input: expect.objectContaining({
          music_length_ms: 300000, // Capped at max
        }),
      });
    });
  });

  describe('config parsing', () => {
    it('uses default promptKey when not specified', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Classical symphony',
              'Input:Duration': 90,
            },
          },
        },
      };

      const testData = new Uint8Array([1, 2, 3]);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => testData.buffer,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('stability-ai/stable-audio-2.5', {
        input: expect.objectContaining({
          prompt: 'Classical symphony',
        }),
      });
    });

    it('sets fixed output MIME type to audio/mpeg', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Relaxing lofi beats',
              'Input:Duration': 120,
            },
          },
        },
      };

      const testData = new Uint8Array([1, 2, 3]);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => testData.buffer,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('audio/mpeg');
    });
  });

  describe('input resolution', () => {
    it('throws error when MusicPrompt is missing', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Input:Duration': 60,
            },
          },
        },
      };

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow(
        'No music prompt available for music generation.',
      );
    });

    it('throws error when MusicPrompt is empty string', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': '   ',
              'Input:Duration': 60,
            },
          },
        },
      };

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow(
        'No music prompt available for music generation.',
      );
    });

    it('throws error when Duration is missing', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Happy tune',
            },
          },
        },
      };

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow(
        'No duration available for music generation.',
      );
    });

    it('throws error when Duration is zero or negative', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Happy tune',
              'Input:Duration': 0,
            },
          },
        },
      };

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow(
        'No duration available for music generation.',
      );
    });
  });

  describe('error handling', () => {
    it('throws error when Replicate prediction fails', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Test music',
              'Input:Duration': 60,
            },
          },
        },
      };

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockRejectedValue(new Error('Replicate API error'));
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow('Replicate music prediction failed.');
    });

    it('returns failed status when artefact download fails', async () => {
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

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Test music',
              'Input:Duration': 60,
            },
          },
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('failed');
      expect(result.artefacts[0]?.status).toBe('failed');
    });
  });

  describe('diagnostics', () => {
    it('includes duration mapping in diagnostics', async () => {
      const handler = createReplicateMusicHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'elevenlabs/music',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'elevenlabs/music',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPromptGenerator.MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            durationKey: 'music_length_ms',
            durationMultiplier: 1000,
            maxDuration: 300000,
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              'Artifact:MusicPromptGenerator.MusicPrompt': 'Dance track',
              'Input:Duration': 90,
            },
          },
        },
      };

      const testData = new Uint8Array([1, 2, 3]);
      (global.fetch as any).mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => testData.buffer,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/music.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.diagnostics).toMatchObject({
        provider: 'replicate',
        model: 'elevenlabs/music',
        duration: 90,
        mappedDuration: 90000,
      });
    });
  });
});
