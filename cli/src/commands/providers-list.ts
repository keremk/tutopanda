import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createProviderRegistry, type ProviderDescriptor } from 'tutopanda-providers';
import { loadBlueprintBundle } from '../lib/blueprint-loader/index.js';
import { buildProducerOptionsFromBlueprint } from '../lib/producer-options.js';
import { expandPath } from '../lib/path.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BLUEPRINT_PATH = resolve(__dirname, '../../blueprints/yaml/audio-only.yaml');

export interface ProvidersListOptions {
  blueprintPath?: string;
}

export interface ProviderListEntry {
  producer: string;
  provider: string;
  model: string;
  environment: string;
  status: 'ready' | 'error';
  message?: string;
}

export interface ProvidersListResult {
  entries: ProviderListEntry[];
}

export async function runProvidersList(options: ProvidersListOptions = {}): Promise<ProvidersListResult> {
  const blueprintPath = options.blueprintPath
    ? expandPath(options.blueprintPath)
    : DEFAULT_BLUEPRINT_PATH;
  const { root } = await loadBlueprintBundle(blueprintPath);
  const providerOptions = buildProducerOptionsFromBlueprint(root);

  const registry = createProviderRegistry({ mode: 'live' });
  const entries: ProviderListEntry[] = [];

  for (const [producer, variants] of providerOptions) {
    for (const variant of variants) {
      const descriptor: ProviderDescriptor = {
        provider: variant.provider as ProviderDescriptor['provider'],
        model: variant.model,
        environment: variant.environment,
      };

      let status: ProviderListEntry['status'] = 'ready';
      let message: string | undefined;

      try {
        const handler = registry.resolve(descriptor);
        await handler.warmStart?.({});
      } catch (error) {
        status = 'error';
        message = error instanceof Error ? error.message : String(error);
      }

      entries.push({
        producer,
        provider: variant.provider,
        model: variant.model,
        environment: variant.environment,
        status,
        message,
      });
    }
  }

  return { entries };
}
