/**
 * Audio Integration Test (single model)
 *
 * Set exactly one of:
 * - RUN_AUDIO_MINIMAX=1 (minimax/speech-02-hd)
 * - RUN_AUDIO_ELEVENLABS=1 (elevenlabs/v3)
 * - RUN_ALL_AUDIO_TESTS=1 (picks minimax/speech-02-hd)
 *
 * RUN_AUDIO_MINIMAX=1 pnpm test:integration
 */

import { describe, expect, it } from 'vitest';
import { createReplicateAudioHandler } from '../../src/producers/audio/replicate-audio.js';
import type { ProviderJobContext } from '../../src/types.js';
import { saveTestArtifact } from './test-utils.js';
import {
  buildAudioExtras,
  getAudioMapping,
  loadAudioSchema,
  type AudioModel,
} from './schema-helpers.js';

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;

function selectModel(): AudioModel | null {
  const enabled: Array<{ flag: string; model: AudioModel }> = [];
  if (process.env.RUN_AUDIO_MINIMAX) {
    enabled.push({ flag: 'RUN_AUDIO_MINIMAX', model: 'minimax/speech-02-hd' });
  }
  if (process.env.RUN_AUDIO_ELEVENLABS) {
    enabled.push({ flag: 'RUN_AUDIO_ELEVENLABS', model: 'elevenlabs/v3' });
  }
  if (process.env.RUN_ALL_AUDIO_TESTS) {
    enabled.push({ flag: 'RUN_ALL_AUDIO_TESTS', model: 'minimax/speech-02-hd' });
  }

  const uniqueModels = new Set(enabled.map((entry) => entry.model));
  if (uniqueModels.size > 1) {
    throw new Error('Select exactly one audio model env flag; multiple models enabled.');
  }
  return enabled[0]?.model ?? null;
}

function resolveInputsFromSchema(model: AudioModel): Record<string, unknown> {
  const schemaText = loadAudioSchema(model);
  const schema = JSON.parse(schemaText) as { properties?: Record<string, { default?: unknown; minimum?: number }> };
  const properties = schema.properties ?? {};
  const mapping = getAudioMapping(model);
  const inputs: Record<string, unknown> = {
    'Input:TextInput': `Integration audio prompt for ${model}`,
  };

  for (const [alias, spec] of Object.entries(mapping)) {
    if (alias === 'TextInput') continue;
    const property = properties[spec.field] ?? {};
    if (property.default !== undefined) {
      inputs[`Input:${alias}`] = property.default;
      continue;
    }
    if (typeof property.minimum === 'number') {
      inputs[`Input:${alias}`] = property.minimum;
      continue;
    }
    inputs[`Input:${alias}`] = inputs[`Input:${alias}`] ?? 'Narrator';
  }

  return inputs;
}

describeIfToken('Replicate audio integration (single model)', () => {
  const model = selectModel();
  const describeBlock = model ? describe : describe.skip;

  describeBlock(model ?? 'no-model', () => {
    it('text-to-audio uses schema defaults and mapping', async () => {
      if (!model) {
        throw new Error('No model selected for integration test.');
      }

      const handler = createReplicateAudioHandler()({
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
        jobId: `integration-${model}-audio`,
        provider: 'replicate',
        model,
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: Object.keys(resolvedInputs),
        produces: ['Artifact:SegmentAudio[segment=0]'],
        context: {
          providerConfig: {},
          extras: buildAudioExtras(model, resolvedInputs),
        },
      };

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.artefactId).toBe('Artifact:SegmentAudio[segment=0]');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('audio/mpeg');
      expect(result.artefacts[0]?.blob?.data).toBeInstanceOf(Uint8Array);

      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact(`test-audio-${model}.mp3`, result.artefacts[0].blob.data);
      }
    }, 180000);
  });
});
