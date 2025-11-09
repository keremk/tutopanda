import type {
  Blueprint,
  ProducerCatalog,
  ProducerCatalogEntry,
} from 'tutopanda-core';
import type {
  ProviderAttachment,
  ProviderEnvironment,
} from 'tutopanda-providers';

export interface LoadedProducerOption {
  priority: 'main';
  provider: string;
  model: string;
  environment: ProviderEnvironment;
  config?: Record<string, unknown>;
  attachments: ProviderAttachment[];
  sourcePath?: string;
  customAttributes?: Record<string, unknown>;
}

export type ProducerOptionsMap = Map<string, LoadedProducerOption[]>;

export function buildProducerOptionsFromBlueprint(
  blueprint: Blueprint,
): ProducerOptionsMap {
  const map: ProducerOptionsMap = new Map();

  for (const producer of blueprint.producers) {
    const key = producer.name;
    const {
      name: _name,
      provider,
      model,
      ...rest
    } = producer;

    const option: LoadedProducerOption = {
      priority: 'main',
      provider,
      model,
      environment: 'local',
      config: Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : undefined,
      attachments: [],
      sourcePath: blueprint.meta.id,
      customAttributes: undefined,
    };

    map.set(key, [option]);
  }

  return map;
}

export function buildProducerCatalog(
  options: ProducerOptionsMap,
): ProducerCatalog {
  const catalog: Record<string, ProducerCatalogEntry> = {};
  for (const [producer, entries] of options) {
    if (!entries || entries.length === 0) {
      throw new Error(`No producer options defined for "${producer}".`);
    }
    const primary = entries[0]!;
    catalog[producer] = toCatalogEntry(primary);
  }
  return catalog as ProducerCatalog;
}

function toCatalogEntry(option: LoadedProducerOption): ProducerCatalogEntry {
  return {
    provider: option.provider as ProducerCatalogEntry['provider'],
    providerModel: option.model,
    rateKey: `${option.provider}:${option.model}`,
  };
}
