/**
 * Video Integration Test (single model)
 *
 * Set exactly one of the following to choose the model:
 * - RUN_VIDEO_SEEDANCE_PRO_FAST=1
 * - RUN_VIDEO_SEEDANCE_LITE=1
 * - RUN_VIDEO_VEO_FAST=1
 * - RUN_ALL_VIDEO_TESTS=1 (picks bytedance/seedance-1-pro-fast)
 * 
 * RUN_VIDEO_SEEDANCE_PRO_FAST=1 pnpm test:integration
 */

import { describe, expect, it } from 'vitest';
import type { ProviderJobContext } from '../../src/types.js';
import { createReplicateVideoHandler } from '../../src/producers/video/replicate-video.js';
import { saveTestArtifact } from './test-utils.js';
import { buildVideoExtras, getVideoMapping, loadSchema, type VideoModel } from './schema-helpers.js';

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;

function selectModel(): VideoModel | null {
  const enabled: Array<{ flag: string; model: VideoModel }> = [];
  if (process.env.RUN_VIDEO_SEEDANCE_PRO_FAST) enabled.push({ flag: 'RUN_VIDEO_SEEDANCE_PRO_FAST', model: 'bytedance/seedance-1-pro-fast' });
  if (process.env.RUN_VIDEO_SEEDANCE_LITE) enabled.push({ flag: 'RUN_VIDEO_SEEDANCE_LITE', model: 'bytedance/seedance-1-lite' });
  if (process.env.RUN_VIDEO_VEO_FAST) enabled.push({ flag: 'RUN_VIDEO_VEO_FAST', model: 'google/veo-3.1-fast' });
  if (process.env.RUN_ALL_VIDEO_TESTS) enabled.push({ flag: 'RUN_ALL_VIDEO_TESTS', model: 'bytedance/seedance-1-pro-fast' });

  const uniqueModels = new Set(enabled.map((entry) => entry.model));
  if (uniqueModels.size > 1) {
    throw new Error('Select exactly one video model env flag; multiple models enabled.');
  }
  return enabled[0]?.model ?? null;
}

function resolveInputsFromSchema(model: VideoModel): Record<string, unknown> {
  const schemaText = loadSchema(model);
  const schema = JSON.parse(schemaText) as { properties?: Record<string, { default?: unknown }> };
  const properties = schema.properties ?? {};
  const mapping = getVideoMapping(model);
  const inputs: Record<string, unknown> = {
    'Input:Prompt': `Integration test prompt for ${model}`,
  };

  for (const [alias, spec] of Object.entries(mapping)) {
    if (alias === 'Prompt') continue;
    const property = properties[spec.field] ?? {};
    if (spec.field === 'duration') {
      inputs[`Input:${alias}`] = 2;
      continue;
    }
    if (spec.field === 'resolution') {
      inputs[`Input:${alias}`] = model === 'google/veo-3.1-fast' ? '720p' : '480p';
      continue;
    }
    if (property.default !== undefined) {
      inputs[`Input:${alias}`] = property.default;
      continue;
    }
    // Provide a basic value for required fields without defaults (e.g., aspect_ratio)
    inputs[`Input:${alias}`] = inputs[`Input:${alias}`] ?? '16:9';
  }

  return inputs;
}

describeIfToken('Replicate video integration (single model)', () => {
  const model = selectModel();
  const describeBlock = model ? describe : describe.skip;

  describeBlock(model ?? 'no-model', () => {
    it('text-to-video uses schema defaults and mapping', async () => {
      if (!model) {
        throw new Error('No model selected for integration test.');
      }

      const handler = createReplicateVideoHandler()({
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
        jobId: `integration-${model}-text`,
        provider: 'replicate',
        model,
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: Object.keys(resolvedInputs),
        produces: ['Artifact:SegmentVideo[0]'],
        context: {
          providerConfig: {},
          extras: buildVideoExtras(model, resolvedInputs),
        },
      };

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.artefactId).toBe('Artifact:SegmentVideo[0]');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('video/mp4');
      expect(result.artefacts[0]?.blob?.data).toBeInstanceOf(Uint8Array);

      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact(`test-video-${model}-text.mp4`, result.artefacts[0].blob.data);
      }
    }, 300000);
  });
});
