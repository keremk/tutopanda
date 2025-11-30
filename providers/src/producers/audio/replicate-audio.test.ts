import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderJobContext, SecretResolver } from '../../types.js';
import { createReplicateAudioHandler } from './replicate-audio.js';

vi.mock('replicate', () => ({
  default: vi.fn().mockImplementation(() => ({
    run: vi.fn(),
  })),
}));

global.fetch = vi.fn();

const schemaText = JSON.stringify({
  type: 'object',
  required: ['text', 'voice_id'],
  properties: {
    text: { type: 'string' },
    voice_id: { type: 'string' },
  },
});

describe('replicate-audio (schema-first, no fallbacks)', () => {
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
        'Input:TextInput': 'Narration for audio',
        'Input:VoiceId': 'Wise_Woman',
      },
      jobContext: {
        inputBindings: {
          TextInput: 'Input:TextInput',
          VoiceId: 'Input:VoiceId',
        },
        sdkMapping: {
          TextInput: { field: 'text', required: true },
          VoiceId: { field: 'voice_id', required: true },
        },
      },
      plannerContext: { index: { segment: 0 } },
      schema: { input: schemaText },
    };

    return {
      jobId: 'test-job',
      provider: 'replicate',
      model: 'minimax/speech-02-hd',
      revision: 'rev-test',
      layerIndex: 0,
      attempt: 1,
      inputs: Object.keys(extras.resolvedInputs),
      produces: ['Artifact:SegmentAudio[segment=0]'],
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

    const request = baseRequest();
    const Replicate = (await import('replicate')).default;
    const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
    (Replicate as any).mockImplementation(() => ({ run: mockRun }));

    await handler.warmStart?.({ logger: undefined });
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
      input: {
        text: 'Narration for audio',
        voice_id: 'Wise_Woman',
      },
    });
  });

  it('fails fast when schema is missing', async () => {
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

    const request = baseRequest();
    delete (request.context.extras as any).schema;

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Missing input schema/);
  });

  it('fails fast when required mapped input is absent', async () => {
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

    const request = baseRequest();
    const extras = extrasFor(request);
    delete extras.resolvedInputs['Input:TextInput'];

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Missing required input/);
  });

  it('fails when payload violates the input schema', async () => {
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

    const request = baseRequest();
    const extras = extrasFor(request);
    extras.resolvedInputs['Input:VoiceId'] = 42;

    await handler.warmStart?.({ logger: undefined });
    await expect(handler.invoke(request)).rejects.toThrow(/Invalid input payload/);
  });

  it('ignores providerConfig defaults and customAttributes', async () => {
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

    const request = baseRequest();
    request.context.providerConfig = {
      defaults: { speed: 2 },
      customAttributes: { pitch: 4 },
    };

    const Replicate = (await import('replicate')).default;
    const mockRun = vi.fn().mockResolvedValue('https://example.com/audio.mp3');
    (Replicate as any).mockImplementation(() => ({ run: mockRun }));

    await handler.warmStart?.({ logger: undefined });
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(mockRun).toHaveBeenCalledWith('minimax/speech-02-hd', {
      input: { text: 'Narration for audio', voice_id: 'Wise_Woman' },
    });
  });

  it('validates required inputs in simulated mode (dry run)', async () => {
    const handler = createReplicateAudioHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        environment: 'local',
      },
      mode: 'simulated',
      secretResolver,
      logger: undefined,
    });

    const request = baseRequest();
    const extras = extrasFor(request);
    delete extras.resolvedInputs['Input:VoiceId'];

    await expect(handler.invoke(request)).rejects.toThrow(/Missing required input/);
  });
});
