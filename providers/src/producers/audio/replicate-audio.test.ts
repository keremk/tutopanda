import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createReplicateAudioHandler } from './replicate-audio.js';
import type { ProviderJobContext, SecretResolver } from '../../types.js';

// Mock the Replicate SDK
vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({
    run: vi.fn(),
  })),
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('createReplicateAudioHandler', () => {
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

  describe('parseReplicateAudioConfig', () => {
    it('uses default textKey when not specified', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
        input: expect.objectContaining({
          text: 'Test narration',
        }),
      });
    });

    it('uses custom textKey when specified', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'elevenlabs/v3',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'elevenlabs/v3',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {
            textKey: 'prompt',
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('elevenlabs/v3', {
        input: expect.objectContaining({
          prompt: 'Test narration',
        }),
      });
    });

    it('merges defaults and customAttributes', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {
            defaults: {
              speed: 1.0,
              pitch: 0,
            },
            customAttributes: {
              voice_id: 'Wise_Woman',
              speed: 1.2,
            },
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
        input: expect.objectContaining({
          text: 'Test narration',
          speed: 1.2,
          pitch: 0,
          voice_id: 'Wise_Woman',
        }),
      });
    });

    it('sets fixed output MIME type to audio/mpeg', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('audio/mpeg');
    });
  });

  describe('resolveText', () => {
    it('resolves text from array using segment index', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=1]'],
        produces: ['Artifact:SegmentAudio[segment=1]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 1 },
            },
            resolvedInputs: {
              SegmentNarration: ['First narration', 'Second narration', 'Third narration'],
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
        input: expect.objectContaining({
          text: 'Second narration',
        }),
      });
    });

    it('falls back to first element when segment index is out of bounds', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=10]'],
        produces: ['Artifact:SegmentAudio[segment=10]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 10 },
            },
            resolvedInputs: {
              SegmentNarration: ['Only narration'],
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
        input: expect.objectContaining({
          text: 'Only narration',
        }),
      });
    });

    it('handles single string narration', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: 'Single narration string',
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
        input: expect.objectContaining({
          text: 'Single narration string',
        }),
      });
    });

    it('throws error when no text is available', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {},
          },
        },
      };

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow('No text available for audio generation.');
    });

    it('throws error when text is empty string', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: '   ',
            },
          },
        },
      };

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow('No text available for audio generation.');
    });
  });

  describe('resolveVoice', () => {
    it('maps VoiceId from resolvedInputs to voice_id for minimax models', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]', 'Input:VoiceId'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
              VoiceId: 'English_CaptivatingStoryteller',
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
        input: expect.objectContaining({
          text: 'Test narration',
          voice_id: 'English_CaptivatingStoryteller',
        }),
      });
    });

    it('maps VoiceId from resolvedInputs to voice for elevenlabs models', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'elevenlabs/v3',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'elevenlabs/v3',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]', 'Input:VoiceId'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {
            textKey: 'prompt',
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
              VoiceId: 'Grimblewood',
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('elevenlabs/v3', {
        input: expect.objectContaining({
          prompt: 'Test narration',
          voice: 'Grimblewood',
        }),
      });
    });

    it('VoiceId from resolvedInputs takes precedence over customAttributes', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]', 'Input:VoiceId'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {
            customAttributes: {
              voice_id: 'OldVoice',
            },
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
              VoiceId: 'NewVoice',
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
        input: expect.objectContaining({
          text: 'Test narration',
          voice_id: 'NewVoice',
        }),
      });
    });

    it('does not add voice field when VoiceId is not provided', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
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
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      const callArgs = mockRun.mock.calls[0]?.[1] as { input: Record<string, unknown> };
      expect(callArgs.input).not.toHaveProperty('voice');
      expect(callArgs.input).not.toHaveProperty('voice_id');
    });
  });

  describe('error handling', () => {
    it('throws error when Replicate prediction fails', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
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

      await expect(handler.invoke(request)).rejects.toThrow('Replicate prediction failed.');
    });

    it('returns failed status when artefact download fails', async () => {
      const handler = createReplicateAudioHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'minimax/speech-02-hd',
          environment: 'local',
        },
        mode: 'live',
        secretResolver,
        logger: undefined,
      });

      const request: ProviderJobContext = {
        jobId: 'test-job',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        revision: 'test-rev',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Input:SegmentNarration[segment=0]'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: { segment: 0 },
            },
            resolvedInputs: {
              SegmentNarration: ['Test narration'],
            },
          },
        },
      };

      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const Replicate = (await import('replicate')).default;
      const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
      (Replicate as any).mockImplementation(() => ({
        run: mockRun,
      }));

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('failed');
      expect(result.artefacts[0]?.status).toBe('failed');
    });
  });
});
