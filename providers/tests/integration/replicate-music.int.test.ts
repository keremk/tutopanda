/**
 * Music Integration Tests
 *
 * These tests call real Replicate APIs and are expensive/slow.
 * By default, all tests are SKIPPED even if REPLICATE_API_TOKEN is available.
 *
 * Enable specific models via environment variables:
 * - RUN_MUSIC_STABLE_AUDIO=1    (stability-ai/stable-audio-2.5)
 * - RUN_MUSIC_ELEVENLABS=1      (elevenlabs/music)
 * - RUN_ALL_MUSIC_TESTS=1       (runs all music tests)
 *
 * Examples:
 *
 * # Spot check stable-audio model
 * RUN_MUSIC_STABLE_AUDIO=1 pnpm test:integration
 *
 * # Run only elevenlabs test
 * RUN_MUSIC_ELEVENLABS=1 pnpm test:integration
 *
 * # Run all music integration tests
 * RUN_ALL_MUSIC_TESTS=1 pnpm test:integration
 */

import { describe, expect, it } from 'vitest';
import { createReplicateMusicHandler } from '../../src/producers/music/replicate-music.js';
import type { ProviderJobContext } from '../../src/types.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;
const describeIfStableAudio =
  process.env.RUN_MUSIC_STABLE_AUDIO || process.env.RUN_ALL_MUSIC_TESTS
    ? describe
    : describe.skip;
const describeIfElevenlabs =
  process.env.RUN_MUSIC_ELEVENLABS || process.env.RUN_ALL_MUSIC_TESTS
    ? describe
    : describe.skip;

describeIfToken('Replicate music integration', () => {
  describeIfStableAudio('stability-ai/stable-audio-2.5', () => {
    it('generates a music artefact via Replicate (stable-audio)', async () => {
      const handler = createReplicateMusicHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'stability-ai/stable-audio-2.5',
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
        logger: {
          info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
          error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta),
        },
      });

      await handler.warmStart?.({ logger: undefined });

      const request: ProviderJobContext = {
        jobId: 'job-int-replicate-music-stable-audio',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-int-music',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            durationKey: 'duration',
            durationMultiplier: 1,
            maxDuration: 190,
            defaults: {},
            customAttributes: {
              steps: 8,
              cfg_scale: 1,
            },
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              MusicPrompt:
                'Upbeat electronic music with a modern feel, featuring synthesizers and a driving beat',
              Duration: 30, // Short duration for faster test
            },
          },
        },
      };

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);

      const artefact = result.artefacts[0];
      expect(artefact?.status).toBe('succeeded');
      expect(artefact?.blob?.data).toBeInstanceOf(Uint8Array);
      expect(artefact?.blob?.mimeType).toBe('audio/mpeg');
      expect(artefact?.blob?.data.length).toBeGreaterThan(0);

      // Verify diagnostics include duration mapping
      expect(result.diagnostics).toMatchObject({
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        duration: 30,
        mappedDuration: 30, // 30 seconds in seconds
      });

      // Optional: Write to disk for manual verification
      if (artefact?.blob?.data && process.env.WRITE_TEST_OUTPUTS) {
        const outputPath = join(__dirname, 'test-stable-audio-output.mp3');
        writeFileSync(outputPath, artefact.blob.data);
        console.log(`Music written to ${outputPath}`);
      }
    }, 120000); // 2 minute timeout for music generation
  });

  describeIfElevenlabs('elevenlabs/music', () => {
    it('generates a music artefact via Replicate (elevenlabs)', async () => {
      const handler = createReplicateMusicHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'elevenlabs/music',
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
        logger: {
          info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
          error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta),
        },
      });

      await handler.warmStart?.({ logger: undefined });

      const request: ProviderJobContext = {
        jobId: 'job-int-replicate-music-elevenlabs',
        provider: 'replicate',
        model: 'elevenlabs/music',
        revision: 'rev-int-music',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            durationKey: 'music_length_ms',
            durationMultiplier: 1000,
            maxDuration: 300000,
            defaults: {},
            customAttributes: {
              force_instrumental: true,
              output_format: 'mp3_standard',
            },
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              MusicPrompt: 'Calm ambient music with soft piano and gentle strings',
              Duration: 20, // Short duration for faster test (20s = 20000ms)
            },
          },
        },
      };

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);

      const artefact = result.artefacts[0];
      expect(artefact?.status).toBe('succeeded');
      expect(artefact?.blob?.data).toBeInstanceOf(Uint8Array);
      expect(artefact?.blob?.mimeType).toBe('audio/mpeg');
      expect(artefact?.blob?.data.length).toBeGreaterThan(0);

      // Verify diagnostics include duration mapping in milliseconds
      expect(result.diagnostics).toMatchObject({
        provider: 'replicate',
        model: 'elevenlabs/music',
        duration: 20,
        mappedDuration: 20000, // 20 seconds * 1000 = 20000ms
      });

      // Optional: Write to disk for manual verification
      if (artefact?.blob?.data && process.env.WRITE_TEST_OUTPUTS) {
        const outputPath = join(__dirname, 'test-elevenlabs-music-output.mp3');
        writeFileSync(outputPath, artefact.blob.data);
        console.log(`Music written to ${outputPath}`);
      }
    }, 120000); // 2 minute timeout for music generation
  });

  describeIfStableAudio('stability-ai/stable-audio-2.5 duration capping', () => {
    it('caps duration at 190 seconds for stable-audio', async () => {
      const handler = createReplicateMusicHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'stability-ai/stable-audio-2.5',
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
        logger: {
          info: (msg, meta) => console.log(`[INFO] ${msg}`, meta),
          error: (msg, meta) => console.error(`[ERROR] ${msg}`, meta),
        },
      });

      await handler.warmStart?.({ logger: undefined });

      const request: ProviderJobContext = {
        jobId: 'job-int-replicate-music-capping',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        revision: 'rev-int-music',
        layerIndex: 0,
        attempt: 1,
        inputs: ['Artifact:MusicPrompt', 'Input:Duration'],
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            durationKey: 'duration',
            durationMultiplier: 1,
            maxDuration: 190,
            defaults: {},
            customAttributes: {},
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            resolvedInputs: {
              MusicPrompt: 'Epic orchestral soundtrack with sweeping strings',
              Duration: 300, // Exceeds max, should be capped at 190
            },
          },
        },
      };

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);

      const artefact = result.artefacts[0];
      expect(artefact?.status).toBe('succeeded');

      // Verify diagnostics show capping occurred
      expect(result.diagnostics).toMatchObject({
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        duration: 300,
        mappedDuration: 190, // Capped at max
      });
    }, 180000); // 3 minute timeout for longer generation
  });
});
