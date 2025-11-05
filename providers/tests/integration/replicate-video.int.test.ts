/**
 * Video Integration Tests
 *
 * These tests call real Replicate APIs and are expensive/slow.
 * By default, all tests are SKIPPED even if REPLICATE_API_TOKEN is available.
 *
 * Enable specific models via environment variables:
 * - RUN_VIDEO_SEEDANCE_PRO_FAST=1  (text-to-video + image-to-video)
 * - RUN_VIDEO_SEEDANCE_LITE=1      (text-to-video)
 * - RUN_VIDEO_VEO_FAST=1           (text, negative prompt, interpolation)
 * - RUN_ALL_VIDEO_TESTS=1          (runs all video tests)
 *
 * Examples:
 *
 * # Spot check one model
 * RUN_VIDEO_SEEDANCE_PRO_FAST=1 pnpm test:integration
 *
 * # Run only veo tests
 * RUN_VIDEO_VEO_FAST=1 pnpm test:integration
 *
 * # Run all video integration tests
 * RUN_ALL_VIDEO_TESTS=1 pnpm test:integration
 *
 * # Fine-grained with Vitest's -t flag
 * RUN_VIDEO_VEO_FAST=1 pnpm test:integration -t "negative prompt"
 */

import { describe, expect, it } from 'vitest';
import type { ProviderJobContext } from '../../src/types.js';
import { createReplicateVideoHandler } from '../../src/producers/video/replicate-video.js';
import { saveTestArtifact } from './test-utils.js';

/**
 * Helper to fetch an image URL and return it as Uint8Array.
 * This simulates how blobs would be passed from previous steps in a real workflow.
 */
async function fetchImageAsBlob(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;
const describeIfProFast =
  process.env.RUN_VIDEO_SEEDANCE_PRO_FAST || process.env.RUN_ALL_VIDEO_TESTS
    ? describe
    : describe.skip;
const describeIfLite =
  process.env.RUN_VIDEO_SEEDANCE_LITE || process.env.RUN_ALL_VIDEO_TESTS
    ? describe
    : describe.skip;
const describeIfVeo =
  process.env.RUN_VIDEO_VEO_FAST || process.env.RUN_ALL_VIDEO_TESTS ? describe : describe.skip;

describeIfToken('Replicate video integration', () => {
  describeIfProFast('bytedance/seedance-1-pro-fast', () => {
    it('generates a video artefact via Replicate (text-to-video)', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'bytedance/seedance-1-pro-fast',
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
          info: (msg, meta) => console.log('[INFO]', msg, meta),
          error: (msg, meta) => console.error('[ERROR]', msg, meta),
        },
      });

      const request: ProviderJobContext = {
        jobId: 'integration-test-video-1',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            customAttributes: {
              duration: 5,
              resolution: '480p',
              aspect_ratio: '16:9',
              fps: 24,
              camera_fixed: false,
            },
          },
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: [
                'A serene mountain landscape at sunrise, with golden light spreading across snow-capped peaks.',
              ],
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };

      await handler.warmStart?.({
        logger: {
          info: (msg, meta) => console.log('[WARMSTART INFO]', msg, meta),
          error: (msg, meta) => console.error('[WARMSTART ERROR]', msg, meta),
        },
      });

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.artefactId).toBe('Artifact:SegmentVideo[0]');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('video/mp4');
      expect(result.artefacts[0]?.blob?.data).toBeInstanceOf(Uint8Array);

      // Optional: write to disk for manual inspection
      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact('test-video-seedance-pro-fast-text.mp4', result.artefacts[0].blob.data);
      }
    }, 300000); // 5 minute timeout for video generation

    it('generates a video artefact via Replicate (image-to-video)', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'bytedance/seedance-1-pro-fast',
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
          info: (msg, meta) => console.log('[INFO]', msg, meta),
          error: (msg, meta) => console.error('[ERROR]', msg, meta),
        },
      });

      // Fetch image as blob to simulate real workflow where previous step produces blobs
      const imageUrl = 'https://replicate.delivery/pbxt/NwRbjj1ioMkKuMv81xtRn7qVVoCt1E5RvCQt0PVBaoMEHztB/86bd15b6-63fa-4a9d-a54c-de4d694a509a.jpg';
      const imageBlob = await fetchImageAsBlob(imageUrl);
      console.log(`Fetched image blob: ${imageBlob.byteLength} bytes`);

      const request: ProviderJobContext = {
        jobId: 'integration-test-video-2',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['ImageToVideoPrompt', 'SegmentStartImage'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            imageKey: 'image',
            customAttributes: {
              duration: 5,
              resolution: '480p',
              aspect_ratio: '16:9',
              fps: 24,
              camera_fixed: false,
            },
          },
          extras: {
            resolvedInputs: {
              ImageToVideoPrompt: ['Gentle camera movement around the scene.'],
              SegmentStartImage: [imageBlob],  // Using Uint8Array blob instead of URL
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };

      await handler.warmStart?.({
        logger: {
          info: (msg, meta) => console.log('[WARMSTART INFO]', msg, meta),
          error: (msg, meta) => console.error('[WARMSTART ERROR]', msg, meta),
        },
      });

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.artefactId).toBe('Artifact:SegmentVideo[0]');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('video/mp4');
      expect(result.artefacts[0]?.blob?.data).toBeInstanceOf(Uint8Array);

      // Optional: write to disk for manual inspection
      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact('test-video-seedance-pro-fast-image.mp4', result.artefacts[0].blob.data);
      }
    }, 300000); // 5 minute timeout
  });

  describeIfLite('bytedance/seedance-1-lite', () => {
    it('generates a video artefact via Replicate (text-to-video)', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'bytedance/seedance-1-lite',
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
          info: (msg, meta) => console.log('[INFO]', msg, meta),
          error: (msg, meta) => console.error('[ERROR]', msg, meta),
        },
      });

      const request: ProviderJobContext = {
        jobId: 'integration-test-video-3',
        provider: 'replicate',
        model: 'bytedance/seedance-1-lite',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            customAttributes: {
              duration: 5,
              resolution: '480p',
              aspect_ratio: '16:9',
              fps: 24,
              camera_fixed: false,
            },
          },
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: [
                'A calm ocean sunset with waves gently rolling onto the shore.',
              ],
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };

      await handler.warmStart?.({
        logger: {
          info: (msg, meta) => console.log('[WARMSTART INFO]', msg, meta),
          error: (msg, meta) => console.error('[WARMSTART ERROR]', msg, meta),
        },
      });

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.artefactId).toBe('Artifact:SegmentVideo[0]');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('video/mp4');
      expect(result.artefacts[0]?.blob?.data).toBeInstanceOf(Uint8Array);

      // Optional: write to disk for manual inspection
      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact('test-video-seedance-lite.mp4', result.artefacts[0].blob.data);
      }
    }, 300000); // 5 minute timeout
  });

  describeIfVeo('google/veo-3.1-fast', () => {
    it('generates a video artefact via Replicate (text-to-video)', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
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
          info: (msg, meta) => console.log('[INFO]', msg, meta),
          error: (msg, meta) => console.error('[ERROR]', msg, meta),
        },
      });

      const request: ProviderJobContext = {
        jobId: 'integration-test-video-4',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            customAttributes: {
              duration: 4,
              resolution: '720p',
              aspect_ratio: '16:9',
              generate_audio: true,
            },
          },
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: [
                'A bustling city street at night with neon lights reflecting on wet pavement.',
              ],
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };

      await handler.warmStart?.({
        logger: {
          info: (msg, meta) => console.log('[WARMSTART INFO]', msg, meta),
          error: (msg, meta) => console.error('[WARMSTART ERROR]', msg, meta),
        },
      });

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.artefactId).toBe('Artifact:SegmentVideo[0]');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('video/mp4');
      expect(result.artefacts[0]?.blob?.data).toBeInstanceOf(Uint8Array);
      expect(result.diagnostics?.hasImage).toBe(false);

      // Optional: write to disk for manual inspection
      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact('test-video-veo-fast-text.mp4', result.artefacts[0].blob.data);
      }
    }, 300000); // 5 minute timeout

    it('generates a video with negative prompt', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
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
          info: (msg, meta) => console.log('[INFO]', msg, meta),
          error: (msg, meta) => console.error('[ERROR]', msg, meta),
        },
      });

      const request: ProviderJobContext = {
        jobId: 'integration-test-video-5',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['TextToVideoPrompt', 'NegativePrompt'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            negativePromptKey: 'negative_prompt',
            customAttributes: {
              duration: 4,
              resolution: '720p',
              aspect_ratio: '16:9',
              generate_audio: false,
            },
          },
          extras: {
            resolvedInputs: {
              TextToVideoPrompt: ['A peaceful forest scene with sunlight filtering through trees.'],
              NegativePrompt: ['blurry, distorted, low quality, artifacts'],
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };

      await handler.warmStart?.({
        logger: {
          info: (msg, meta) => console.log('[WARMSTART INFO]', msg, meta),
          error: (msg, meta) => console.error('[WARMSTART ERROR]', msg, meta),
        },
      });

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.blob?.mimeType).toBe('video/mp4');
      expect(result.diagnostics?.hasNegativePrompt).toBe(true);

      // Optional: write to disk for manual inspection
      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact('test-video-veo-fast-negative.mp4', result.artefacts[0].blob.data);
      }
    }, 300000); // 5 minute timeout

    it('generates interpolation video with image and last_frame', async () => {
      const handler = createReplicateVideoHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/veo-3.1-fast',
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
          info: (msg, meta) => console.log('[INFO]', msg, meta),
          error: (msg, meta) => console.error('[ERROR]', msg, meta),
        },
      });

      // Fetch images as blobs to simulate real workflow where previous step produces blobs
      const imageUrl = 'https://replicate.delivery/pbxt/NwRbjj1ioMkKuMv81xtRn7qVVoCt1E5RvCQt0PVBaoMEHztB/86bd15b6-63fa-4a9d-a54c-de4d694a509a.jpg';
      const startImageBlob = await fetchImageAsBlob(imageUrl);
      const lastFrameBlob = await fetchImageAsBlob(imageUrl);
      console.log(`Fetched start image blob: ${startImageBlob.byteLength} bytes`);
      console.log(`Fetched last frame blob: ${lastFrameBlob.byteLength} bytes`);

      const request: ProviderJobContext = {
        jobId: 'integration-test-video-6',
        provider: 'replicate',
        model: 'google/veo-3.1-fast',
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: ['ImageToVideoPrompt', 'SegmentStartImage', 'LastFrameImage'],
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {
            promptKey: 'prompt',
            imageKey: 'image',
            lastFrameKey: 'last_frame',
            customAttributes: {
              duration: 4,
              resolution: '720p',
              aspect_ratio: '16:9',
              generate_audio: false,
            },
          },
          extras: {
            resolvedInputs: {
              ImageToVideoPrompt: ['Smooth transition between the two scenes.'],
              SegmentStartImage: [startImageBlob],  // Using Uint8Array blob
              LastFrameImage: [lastFrameBlob],      // Using Uint8Array blob
            },
            plannerContext: { index: { segment: 0 } },
          },
        },
      };

      await handler.warmStart?.({
        logger: {
          info: (msg, meta) => console.log('[WARMSTART INFO]', msg, meta),
          error: (msg, meta) => console.error('[WARMSTART ERROR]', msg, meta),
        },
      });

      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.blob?.mimeType).toBe('video/mp4');
      expect(result.diagnostics?.hasImage).toBe(true);
      expect(result.diagnostics?.hasLastFrame).toBe(true);

      // Optional: write to disk for manual inspection
      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact('test-video-veo-fast-interpolation.mp4', result.artefacts[0].blob.data);
      }
    }, 300000); // 5 minute timeout
  });
});
