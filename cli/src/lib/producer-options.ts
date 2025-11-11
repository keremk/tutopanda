import type {
  BlueprintTreeNode,
  ProducerCatalog,
  ProducerCatalogEntry,
  ProducerConfig,
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
  blueprint: BlueprintTreeNode,
): ProducerOptionsMap {
  const map: ProducerOptionsMap = new Map();
  collectProducers(blueprint, map);
  return map;
}

function collectProducers(node: BlueprintTreeNode, map: ProducerOptionsMap): void {
  for (const producer of node.document.producers) {
    const namespacedName = formatProducerName(node.namespacePath, producer.name);
    const option = toLoadedOption(node, namespacedName, producer);
    registerProducerOption(map, namespacedName, option);
    if (namespacedName !== producer.name) {
      registerProducerOption(map, producer.name, option);
    }
  }
  for (const child of node.children.values()) {
    collectProducers(child, map);
  }
}

function registerProducerOption(
  map: ProducerOptionsMap,
  key: string,
  option: LoadedProducerOption,
): void {
  const existing = map.get(key);
  if (existing) {
    existing.push(option);
  } else {
    map.set(key, [option]);
  }
}

function toLoadedOption(
  node: BlueprintTreeNode,
  namespacedName: string,
  producer: ProducerConfig,
): LoadedProducerOption {
  const {
    name: _name,
    provider,
    model,
    ...rest
  } = producer;

  const configPayload = Object.keys(rest).length > 0 ? (rest as Record<string, unknown>) : undefined;

  return {
    priority: 'main',
    provider,
    model,
    environment: 'local',
    config: configPayload,
    attachments: [],
    sourcePath: namespacedName,
    customAttributes: undefined,
  };
}

function formatProducerName(namespacePath: string[], name: string): string {
  if (namespacePath.length === 0) {
    return name;
  }
  return `${namespacePath.join('.')}.${name}`;
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
