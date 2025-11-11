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

function attachJobContext(request: ProviderJobContext): ProviderJobContext {
  const extras = request.context.extras ?? (request.context.extras = {});
  const resolved = (extras.resolvedInputs = extras.resolvedInputs ?? {});
  const planner = extras.plannerContext && typeof extras.plannerContext === 'object'
    ? (extras.plannerContext as { index?: { segment?: number } })
    : { index: { segment: 0 } };
  const segmentIndex = planner.index?.segment ?? 0;
  const canonicalId = `Artifact:ScriptGeneration.NarrationScript[segment=${segmentIndex}]`;
  const narration = extractNarration(resolved, segmentIndex);
  if (narration !== undefined) {
    resolved.TextInput = narration;
    resolved[canonicalId] = narration;
    resolved['Input:TextInput'] = narration;
  }
  const voiceValue = resolved.VoiceId ?? resolved['Input:VoiceId'];
  if (voiceValue !== undefined) {
    resolved.VoiceId = voiceValue as string;
    resolved['Input:VoiceId'] = voiceValue as string;
  }

  const jobContext = {
    inputBindings: {
      TextInput: canonicalId,
      ...(voiceValue !== undefined ? { VoiceId: 'Input:VoiceId' } : {}),
    },
    sdkMapping: {
      TextInput: { field: request.context.providerConfig?.textKey ?? 'text', required: true },
      ...(voiceValue !== undefined ? { VoiceId: { field: 'voice_id', required: false } } : {}),
    },
  };
  extras.jobContext = {
    ...(extras.jobContext ?? {}),
    ...jobContext,
  };
  return request;
}

function extractNarration(resolvedInputs: Record<string, unknown>, segmentIndex: number): string | undefined {
  const source = resolvedInputs.TextInput ?? resolvedInputs.SegmentNarration;
  if (Array.isArray(source)) {
    const entry = source[segmentIndex] ?? source[0];
    if (typeof entry === 'string' && entry.trim()) {
      return entry;
    }
    return undefined;
  }
  if (typeof source === 'string' && source.trim()) {
    return source;
  }
  return undefined;
}

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
            jobContext: {
              inputBindings: {
                TextInput: 'Artifact:ScriptGeneration.NarrationScript[segment=0]',
              },
              sdkMapping: {
                TextInput: { field: 'text', required: true },
              },
            },
            resolvedInputs: {
              TextInput: 'Test narration',
              'Artifact:ScriptGeneration.NarrationScript[segment=0]': 'Test narration',
            },
          },
        },
      };
      attachJobContext(request);

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
            jobContext: {
              inputBindings: {
                TextInput: 'Artifact:ScriptGeneration.NarrationScript[segment=0]',
              },
              sdkMapping: {
                TextInput: { field: 'prompt', required: true },
              },
            },
            resolvedInputs: {
              TextInput: 'Test narration',
              'Artifact:ScriptGeneration.NarrationScript[segment=0]': 'Test narration',
            },
          },
        },
      };
      attachJobContext(request);

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
            jobContext: {
              inputBindings: {
                TextInput: 'Artifact:ScriptGeneration.NarrationScript[segment=0]',
                VoiceId: 'Input:VoiceId',
              },
              sdkMapping: {
                TextInput: { field: 'text', required: true },
                VoiceId: { field: 'voice_id', required: false },
              },
            },
        resolvedInputs: {
          'Artifact:ScriptGeneration.NarrationScript[segment=0]': 'Test narration',
          'Input:VoiceId': 'Narrator',
          'Input:TextInput': 'Test narration',
        },
      },
    },
  };
      attachJobContext(request);

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
          voice_id: 'Narrator',
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
      attachJobContext(request);

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
      attachJobContext(request);

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
      attachJobContext(request);

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
      attachJobContext(request);

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
      attachJobContext(request);

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow('Missing required input \"Artifact:ScriptGeneration.NarrationScript[segment=0]\" for field \"text\" (alias \"TextInput\").');
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
      attachJobContext(request);

      await handler.warmStart?.({ logger: undefined });

      await expect(handler.invoke(request)).rejects.toThrow('Missing required input \"Artifact:ScriptGeneration.NarrationScript[segment=0]\" for field \"text\" (alias \"TextInput\").');
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
      attachJobContext(request);

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
      attachJobContext(request);

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
      attachJobContext(request);

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
      attachJobContext(request);

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
      attachJobContext(request);

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
      attachJobContext(request);

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
