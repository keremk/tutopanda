import { createProviderRegistry } from 'tutopanda-providers';
import { readCliConfig } from '../lib/cli-config.js';
import {
  loadSettings,
  loadSettingsOverrides,
  mergeProviderOptions,
  type ProviderOptionsMap,
} from '../lib/provider-settings.js';
import { expandPath } from '../lib/path.js';

export interface ProvidersListOptions {
  settingsPath?: string;
}

export interface ProviderListEntry {
  producer: string;
  priority: 'main' | 'fallback';
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
  const cliConfig = await readCliConfig();
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }

  const defaultSettings = await loadSettings(cliConfig.defaultSettingsPath);
  let providerOptions: ProviderOptionsMap = defaultSettings.providerOptions;

  if (options.settingsPath) {
    const overrides = await loadSettingsOverrides(expandPath(options.settingsPath));
    providerOptions = mergeProviderOptions(providerOptions, overrides.providerOptions);
  }

  const registry = createProviderRegistry({ mode: 'live' });
  const entries: ProviderListEntry[] = [];

  for (const [producer, variants] of providerOptions) {
    for (const variant of variants) {
      const descriptor = {
        provider: variant.provider,
        model: variant.model,
        environment: variant.environment,
      } as const;

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
        priority: variant.priority,
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
