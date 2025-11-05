/**
 * Text-to-Image Integration Tests
 *
 * These tests call real Replicate APIs and are expensive/slow.
 * By default, all tests are SKIPPED even if REPLICATE_API_TOKEN is available.
 *
 * Enable specific models via environment variables:
 * - RUN_IMAGE_SEEDREAM=1       (bytedance/seedream-4)
 * - RUN_IMAGE_NANO_BANANA=1    (google/nano-banana)
 * - RUN_IMAGE_QWEN=1           (qwen/qwen-image)
 * - RUN_ALL_IMAGE_TESTS=1      (runs all image tests)
 *
 * Examples:
 *
 * # Spot check seedream model
 * RUN_IMAGE_SEEDREAM=1 pnpm test:integration
 *
 * # Run nano-banana test
 * RUN_IMAGE_NANO_BANANA=1 pnpm test:integration
 *
 * # Run all image integration tests
 * RUN_ALL_IMAGE_TESTS=1 pnpm test:integration
 */

import { describe, expect, it } from 'vitest';
import { createReplicateTextToImageHandler } from '../../src/producers/image/replicate-text-to-image.js';
import type { ProviderJobContext } from '../../src/types.js';
import { saveTestArtifact } from './test-utils.js';

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;
const describeIfSeedream =
  process.env.RUN_IMAGE_SEEDREAM || process.env.RUN_ALL_IMAGE_TESTS ? describe : describe.skip;
const describeIfNanoBanana =
  process.env.RUN_IMAGE_NANO_BANANA || process.env.RUN_ALL_IMAGE_TESTS ? describe : describe.skip;
const describeIfQwen =
  process.env.RUN_IMAGE_QWEN || process.env.RUN_ALL_IMAGE_TESTS ? describe : describe.skip;

describeIfToken('Replicate text-to-image integration', () => {
  describeIfSeedream('bytedance/seedream-4', () => {
    it('generates an image artefact via Replicate', async () => {
    const handler = createReplicateTextToImageHandler()({
      descriptor: {
        provider: 'replicate',
        model: 'bytedance/seedream-4',
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
      jobId: 'job-int-replicate-image',
      provider: 'replicate',
      model: 'bytedance/seedream-4',
      revision: 'rev-int-img',
      layerIndex: 0,
      attempt: 1,
      inputs: [
        'Input:SegmentImagePromptInput[segment=0][image=0]',
        'Input:ImagesPerSegment',
        'Input:AspectRatio',
      ],
      produces: ['Artifact:SegmentImage[segment=0][image=0]'],
      context: {
        providerConfig: {
          defaults: {
            negative_prompt: 'blurry, distorted, watermark, low contrast',
            guidance_scale: 3,
            num_inference_steps: 8,
            aspect_ratio: '16:9',
          },
          promptKey: 'prompt',
          negativePromptKey: 'negative_prompt',
          aspectRatioKey: 'aspect_ratio',
          imageCountKey: 'num_outputs',
          outputMimeType: 'image/png',
        },
        rawAttachments: [],
        environment: 'local',
        observability: undefined,
        extras: {
          plannerContext: {
            index: {
              segment: 0,
              image: 0,
            },
          },
          resolvedInputs: {
            SegmentImagePromptInput: ['A high-resolution illustration of bioluminescent waves at night'],
            ImagesPerSegment: 1,
            AspectRatio: '16:9',
          },
        },
      },
    };

    const result = await handler.invoke(request);
    // eslint-disable-next-line no-console
    console.log('Replicate integration result:', {
      status: result.status,
      diagnostics: result.diagnostics,
    });

    expect(result.status).toBe('succeeded');
    const artefact = result.artefacts[0];
    expect(artefact).toBeDefined();
    expect(artefact?.blob?.data).toBeInstanceOf(Uint8Array);
    expect((artefact?.blob?.data?.length ?? 0) > 0).toBe(true);
    
    // Temporary: write artifact to disk for inspection
    if (artefact?.blob?.data) {
      saveTestArtifact('test-output-seedream.png', artefact.blob.data);
    }
    });
  });

  describeIfNanoBanana('google/nano-banana', () => {
    it('generates an image artefact via Replicate (nano-banana)', async () => {
      const handler = createReplicateTextToImageHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'google/nano-banana',
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
        jobId: 'job-int-replicate-image-nano-banana',
        provider: 'replicate',
        model: 'google/nano-banana',
        revision: 'rev-int-img-nano',
        layerIndex: 0,
        attempt: 1,
        inputs: [
          'Input:SegmentImagePromptInput[segment=0][image=0]',
          'Input:ImagesPerSegment',
          'Input:AspectRatio',
        ],
        produces: ['Artifact:SegmentImage[segment=0][image=0]'],
        context: {
          providerConfig: {
            defaults: {},
            promptKey: 'prompt',
            aspectRatioKey: 'aspect_ratio',
            imageCountKey: 'num_outputs',
            outputMimeType: 'image/png',
            customAttributes: {
              aspect_ratio: '16:9',
              output_format: 'png',
            },
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: {
                segment: 0,
                image: 0,
              },
            },
            resolvedInputs: {
              SegmentImagePromptInput: ['A vibrant sunset over a peaceful lake with mountains in the background'],
              ImagesPerSegment: 1,
              AspectRatio: '16:9',
            },
          },
        },
      };

      const result = await handler.invoke(request);
      // eslint-disable-next-line no-console
      console.log('Replicate nano-banana integration result:', {
        status: result.status,
        diagnostics: result.diagnostics,
      });

      expect(result.status).toBe('succeeded');
      const artefact = result.artefacts[0];
      expect(artefact).toBeDefined();
      expect(artefact?.blob?.data).toBeInstanceOf(Uint8Array);
      expect((artefact?.blob?.data?.length ?? 0) > 0).toBe(true);

      // Temporary: write artifact to disk for inspection
      if (artefact?.blob?.data) {
        saveTestArtifact('test-output-nano-banana.png', artefact.blob.data);
      }
    }, 60000); // 1 minute timeout
  });

  describeIfQwen('qwen/qwen-image', () => {
    it('generates an image artefact via Replicate (qwen)', async () => {
      const handler = createReplicateTextToImageHandler()({
        descriptor: {
          provider: 'replicate',
          model: 'qwen/qwen-image',
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
        jobId: 'job-int-replicate-image-qwen',
        provider: 'replicate',
        model: 'qwen/qwen-image',
        revision: 'rev-int-img-qwen',
        layerIndex: 0,
        attempt: 1,
        inputs: [
          'Input:SegmentImagePromptInput[segment=0][image=0]',
          'Input:ImagesPerSegment',
          'Input:AspectRatio',
        ],
        produces: ['Artifact:SegmentImage[segment=0][image=0]'],
        context: {
          providerConfig: {
            defaults: {},
            promptKey: 'prompt',
            aspectRatioKey: 'aspect_ratio',
            imageCountKey: 'num_outputs',
            outputMimeType: 'image/png',
            customAttributes: {
              aspect_ratio: '16:9',
              output_format: 'png',
              image_size: 'optimize_for_quality',
              go_fast: true,
              guidance: 4,
              strength: 0.9,
              enhance_prompt: true,
              output_quality: 80,
              num_inference_steps: 50,
              disable_safety_checker: false,
            },
          },
          rawAttachments: [],
          environment: 'local',
          observability: undefined,
          extras: {
            plannerContext: {
              index: {
                segment: 0,
                image: 0,
              },
            },
            resolvedInputs: {
              SegmentImagePromptInput: ['A futuristic cityscape at night with neon lights and flying vehicles'],
              ImagesPerSegment: 1,
              AspectRatio: '16:9',
            },
          },
        },
      };

      const result = await handler.invoke(request);
      // eslint-disable-next-line no-console
      console.log('Replicate qwen integration result:', {
        status: result.status,
        diagnostics: result.diagnostics,
      });

      expect(result.status).toBe('succeeded');
      const artefact = result.artefacts[0];
      expect(artefact).toBeDefined();
      expect(artefact?.blob?.data).toBeInstanceOf(Uint8Array);
      expect((artefact?.blob?.data?.length ?? 0) > 0).toBe(true);

      // Temporary: write artifact to disk for inspection
      if (artefact?.blob?.data) {
        saveTestArtifact('test-output-qwen.png', artefact.blob.data);
      }
    }, 60000); // 1 minute timeout
  });
});
