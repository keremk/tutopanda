/**
 * Music Integration Test (single model)
 *
 * Set exactly one of:
 * - RUN_MUSIC_STABLE_AUDIO=1 (stability-ai/stable-audio-2.5)
 * - RUN_MUSIC_ELEVENLABS=1 (elevenlabs/music)
 * - RUN_ALL_MUSIC_TESTS=1 (picks stability-ai/stable-audio-2.5)
 *
 * RUN_MUSIC_STABLE_AUDIO=1 pnpm test:integration
 */

import { describe, expect, it } from 'vitest';
import { createReplicateMusicHandler } from '../../src/producers/music/replicate-music.js';
import type { ProviderJobContext } from '../../src/types.js';
import { saveTestArtifact } from './test-utils.js';
import {
  buildMusicExtras,
  getMusicMapping,
  loadMusicSchema,
  type MusicModel,
} from './schema-helpers.js';

const describeIfToken = process.env.REPLICATE_API_TOKEN ? describe : describe.skip;

function selectModel(): MusicModel | null {
  const enabled: Array<{ flag: string; model: MusicModel }> = [];
  if (process.env.RUN_MUSIC_STABLE_AUDIO) {
    enabled.push({ flag: 'RUN_MUSIC_STABLE_AUDIO', model: 'stability-ai/stable-audio-2.5' });
  }
  if (process.env.RUN_MUSIC_ELEVENLABS) {
    enabled.push({ flag: 'RUN_MUSIC_ELEVENLABS', model: 'elevenlabs/music' });
  }
  if (process.env.RUN_ALL_MUSIC_TESTS) {
    enabled.push({ flag: 'RUN_ALL_MUSIC_TESTS', model: 'stability-ai/stable-audio-2.5' });
  }

  const uniqueModels = new Set(enabled.map((entry) => entry.model));
  if (uniqueModels.size > 1) {
    throw new Error('Select exactly one music model env flag; multiple models enabled.');
  }
  return enabled[0]?.model ?? null;
}

function resolveInputsFromSchema(model: MusicModel): Record<string, unknown> {
  const schemaText = loadMusicSchema(model);
  const schema = JSON.parse(schemaText) as { properties?: Record<string, { default?: unknown; minimum?: number }> };
  const properties = schema.properties ?? {};
  const mapping = getMusicMapping(model);
  const inputs: Record<string, unknown> = {
    'Input:Prompt': `Integration music prompt for ${model}`,
  };

  for (const [alias, spec] of Object.entries(mapping)) {
    if (alias === 'Prompt') continue;
    const property = properties[spec.field] ?? {};
    if (typeof property.minimum === 'number') {
      inputs[`Input:${alias}`] = property.minimum;
      continue;
    }
    if (property.default !== undefined) {
      inputs[`Input:${alias}`] = property.default;
      continue;
    }
    inputs[`Input:${alias}`] = inputs[`Input:${alias}`] ?? 5;
  }

  return inputs;
}

describeIfToken('Replicate music integration (single model)', () => {
  const model = selectModel();
  const describeBlock = model ? describe : describe.skip;

  describeBlock(model ?? 'no-model', () => {
    it('prompt-to-music uses schema defaults and mapping', async () => {
      if (!model) {
        throw new Error('No model selected for integration test.');
      }

      const handler = createReplicateMusicHandler()({
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
        jobId: `integration-${model}-music`,
        provider: 'replicate',
        model,
        revision: 'rev-test',
        layerIndex: 0,
        attempt: 1,
        inputs: Object.keys(resolvedInputs),
        produces: ['Artifact:MusicTrack'],
        context: {
          providerConfig: {},
          extras: buildMusicExtras(model, resolvedInputs),
        },
      };

      await handler.warmStart?.({ logger: undefined });
      const result = await handler.invoke(request);

      expect(result.status).toBe('succeeded');
      expect(result.artefacts).toHaveLength(1);
      expect(result.artefacts[0]?.artefactId).toBe('Artifact:MusicTrack');
      expect(result.artefacts[0]?.blob?.mimeType).toBe('audio/mpeg');
      expect(result.artefacts[0]?.blob?.data).toBeInstanceOf(Uint8Array);

      if (result.artefacts[0]?.blob?.data) {
        saveTestArtifact(`test-music-${model}.mp3`, result.artefacts[0].blob.data);
      }
    }, 240000);
  });
});
