/**
 * Text-to-Image Integration Test (single model)
 *
 * Set exactly one of:
 * - RUN_IMAGE_SEEDREAM=1 (bytedance/seedream-4)
 * - RUN_IMAGE_NANO_BANANA=1 (google/nano-banana)
 * - RUN_IMAGE_QWEN=1 (qwen/qwen-image)
 * - RUN_ALL_IMAGE_TESTS=1 (picks bytedance/seedream-4)
 *
 * RUN_IMAGE_SEEDREAM=1 pnpm test:integration
 */

import { describe, expect, it } from 'vitest';
import { createReplicateTextToImageHandler } from '../../src/producers/image/replicate-text-to-image.js';
import type { ProviderJobContext } from '../../src/types.js';
import { saveTestArtifact } from './test-utils.js';
import {
  buildImageExtras,
  getImageMapping,
  loadImageSchema,
  type ImageModel,
} from './schema-helpers.js';

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;

function selectModel(): ImageModel | null {
  const enabled: Array<{ flag: string; model: ImageModel }> = [];
  if (process.env.RUN_IMAGE_SEEDREAM) enabled.push({ flag: 'RUN_IMAGE_SEEDREAM', model: 'bytedance/seedream-4' });
  if (process.env.RUN_IMAGE_NANO_BANANA) enabled.push({ flag: 'RUN_IMAGE_NANO_BANANA', model: 'google/nano-banana' });
  if (process.env.RUN_IMAGE_QWEN) enabled.push({ flag: 'RUN_IMAGE_QWEN', model: 'qwen/qwen-image' });
  if (process.env.RUN_ALL_IMAGE_TESTS) enabled.push({ flag: 'RUN_ALL_IMAGE_TESTS', model: 'bytedance/seedream-4' });

  const uniqueModels = new Set(enabled.map((entry) => entry.model));
  if (uniqueModels.size > 1) {
    throw new Error('Select exactly one image model env flag; multiple models enabled.');
  }
  return enabled[0]?.model ?? null;
}

function resolveInputsFromSchema(model: ImageModel): Record<string, unknown> {
  const schemaText = loadImageSchema(model);
  const schema = JSON.parse(schemaText) as { properties?: Record<string, { default?: unknown }> };
  const properties = schema.properties ?? {};
  const mapping = getImageMapping(model);
  const inputs: Record<string, unknown> = {
    'Input:Prompt': `Integration image prompt for ${model}`,
  };

  for (const [alias, spec] of Object.entries(mapping)) {
    if (alias === 'Prompt') continue;
    const property = properties[spec.field] ?? {};
    if (property.default !== undefined) {
      inputs[`Input:${alias}`] = property.default;
      continue;
    }
    inputs[`Input:${alias}`] = inputs[`Input:${alias}`] ?? '16:9';
  }

  return inputs;
}

describeIfToken('Replicate text-to-image integration (single model)', () => {
  const model = selectModel();
  const describeBlock = model ? describe : describe.skip;

  describeBlock(model ?? 'no-model', () => {
    it('prompt-to-image uses schema defaults and mapping', async () => {
      if (!model) {
        throw new Error('No model selected for integration test.');
      }

      const handler = createReplicateTextToImageHandler()({
        descriptor: {
          provider: 'replicate',
          model,
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
      });

      const resolvedInputs = resolveInputsFromSchema(model);

      const request: ProviderJobContext = {
        jobId: `integration-${model}-image`,
        provider: 'replicate',
        model,
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: Object.keys(resolvedInputs),
        produces: ['Artifact:SegmentImage[segment=0][image=0]'],
        context: {
          providerConfig: {},
          extras: buildImageExtras(model, resolvedInputs),
        },
      };

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.artefactId).toBe('Artifact:SegmentImage[segment=0][image=0]');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('image/png');
      expect(result.artefacts[0]?.blob?.data).toBeInstanceOf(Uint8Array);

      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact(`test-image-${model}.png`, result.artefacts[0].blob.data);
      }
    }, 180000);
  });
});
