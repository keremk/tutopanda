import { describe, expect, it } from 'vitest';
import { createReplicateTextToImageHandler } from '../../src/producers/image/replicate-text-to-image.js';
import type { ProviderJobContext } from '../../src/types.js';
import { writeFileSync } from 'fs';
import { join } from 'path';

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;

describeIfToken('Replicate text-to-image integration', () => {
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
      writeFileSync(join(__dirname, 'test-output.png'), artefact.blob.data);
    }
  });
});
