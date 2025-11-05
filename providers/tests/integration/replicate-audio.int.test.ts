/**
 * Audio Integration Tests
 *
 * These tests call real Replicate APIs and are expensive/slow.
 * By default, all tests are SKIPPED even if REPLICATE_API_TOKEN is available.
 *
 * Enable specific models via environment variables:
 * - RUN_AUDIO_MINIMAX=1        (minimax/speech-02-hd)
 * - RUN_AUDIO_ELEVENLABS=1     (elevenlabs/v3)
 * - RUN_ALL_AUDIO_TESTS=1      (runs all audio tests)
 *
 * Examples:
 *
 * # Spot check minimax model
 * RUN_AUDIO_MINIMAX=1 pnpm test:integration
 *
 * # Run only elevenlabs test
 * RUN_AUDIO_ELEVENLABS=1 pnpm test:integration
 *
 * # Run all audio integration tests
 * RUN_ALL_AUDIO_TESTS=1 pnpm test:integration
 */

import { describe, expect, it } from 'vitest';
import { createReplicateAudioHandler } from '../../src/producers/audio/replicate-audio.js';
import type { ProviderJobContext } from '../../src/types.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;
const describeIfMinimax =
  process.env.RUN_AUDIO_MINIMAX || process.env.RUN_ALL_AUDIO_TESTS ? describe : describe.skip;
const describeIfElevenlabs =
  process.env.RUN_AUDIO_ELEVENLABS || process.env.RUN_ALL_AUDIO_TESTS ? describe : describe.skip;

describeIfToken('Replicate audio integration', () => {
  describeIfMinimax('minimax/speech-02-hd', () => {
    it('generates an audio artefact via Replicate (minimax)', async () => {
    const handler = createReplicateAudioHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        environment: 'local',
      },
      mode: 'live',
      secretResolver: {
        async getSecret(key) {
          if (key === 'REPLICATE_API_TOKEN') {
            return process.env.REPLICATE_API_TOKEN ?? null;
          }
          return null;
        },
      },
      logger: undefined,
    });

    await handler.warmStart?.({ logger: undefined });

    const request: ProviderJobContext = {
      jobId: 'job-int-replicate-audio',
      provider: 'replicate',
      model: 'minimax/speech-02-hd',
      revision: 'rev-int-audio',
      layerIndex: 0,
      attempt: 1,
      inputs: ['Input:SegmentNarration[segment=0]'],
      produces: ['Artifact:SegmentAudio[segment=0]'],
      context: {
        providerConfig: {
          textKey: 'text',
          defaults: {},
          customAttributes: {
            voice_id: 'Wise_Woman',
            speed: 1.0,
            pitch: 0,
            volume: 1,
            emotion: 'neutral',
            sample_rate: 32000,
            bitrate: 128000,
            channel: 'mono',
            language_boost: 'English',
          },
        },
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          plannerContext: {
            index: {
              segment: 0,
            },
          },
          resolvedInputs: {
            SegmentNarration: ['Welcome to this audio narration test. This is a sample text for speech generation.'],
          },
        },
      },
    };

    const result = await handler.invoke(request);
    // eslint-disable-next-line no-console
    console.log('Replicate audio integration result:', {
      status: result.status,
      diagnostics: result.diagnostics,
    });

    expect(result.status).toBe('succeeded');
    const artefact = result.artefacts[0];
    expect(artefact).toBeDefined();
    expect(artefact?.blob?.data).toBeInstanceOf(Uint8Array);
    expect((artefact?.blob?.data?.length ?? 0) > 0).toBe(true);
    expect(artefact?.blob?.mimeType).toBe('audio/mpeg');

    // Temporary: write artifact to disk for inspection
    if (artefact?.blob?.data) {
      writeFileSync(join(__dirname, 'test-audio-output.mp3'), artefact.blob.data);
    }
    });
  });

  describeIfElevenlabs('elevenlabs/v3', () => {
    it('generates an audio artefact via Replicate (elevenlabs)', async () => {
    const handler = createReplicateAudioHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'elevenlabs/v3',
        environment: 'local',
      },
      mode: 'live',
      secretResolver: {
        async getSecret(key) {
          if (key === 'REPLICATE_API_TOKEN') {
            return process.env.REPLICATE_API_TOKEN ?? null;
          }
          return null;
        },
      },
      logger: undefined,
    });

    await handler.warmStart?.({ logger: undefined });

    const request: ProviderJobContext = {
      jobId: 'job-int-replicate-audio-elevenlabs',
      provider: 'replicate',
      model: 'elevenlabs/v3',
      revision: 'rev-int-audio-elevenlabs',
      layerIndex: 0,
      attempt: 1,
      inputs: ['Input:SegmentNarration[segment=0]'],
      produces: ['Artifact:SegmentAudio[segment=0]'],
      context: {
        providerConfig: {
          textKey: 'prompt',  // elevenlabs uses 'prompt' instead of 'text'
          defaults: {},
          customAttributes: {
            voice: 'Rachel',
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.0,
            speed: 1.0,
            language_code: 'en',
          },
        },
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          plannerContext: {
            index: {
              segment: 0,
            },
          },
          resolvedInputs: {
            SegmentNarration: ['This is a test using the Eleven Labs voice synthesis model.'],
          },
        },
      },
    };

    const result = await handler.invoke(request);
    // eslint-disable-next-line no-console
    console.log('Replicate elevenlabs integration result:', {
      status: result.status,
      diagnostics: result.diagnostics,
    });

    expect(result.status).toBe('succeeded');
    const artefact = result.artefacts[0];
    expect(artefact).toBeDefined();
    expect(artefact?.blob?.data).toBeInstanceOf(Uint8Array);
    expect((artefact?.blob?.data?.length ?? 0) > 0).toBe(true);
    expect(artefact?.blob?.mimeType).toBe('audio/mpeg');

    // Temporary: write artifact to disk for inspection
    if (artefact?.blob?.data) {
      writeFileSync(join(__dirname, 'test-audio-output-elevenlabs.mp3'), artefact.blob.data);
    }
    });
  });
});
