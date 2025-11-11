import { parse as parseToml } from 'smol-toml';
import type {
  BlueprintArtefactDefinition,
  BlueprintDocument,
  BlueprintEdgeDefinition,
  BlueprintInputDefinition,
  BlueprintProducerOutputDefinition,
  BlueprintProducerSdkMappingField,
  ProducerConfig,
  SubBlueprintDefinition,
} from 'tutopanda-core';

interface RawToml {
  meta?: unknown;
  inputs?: unknown[];
  artifacts?: unknown[];
  graph?: {
    edges?: unknown[];
  };
  subBlueprints?: unknown[];
  producers?: unknown[];
  Producers?: unknown[];
}

export function parseBlueprintDocument(contents: string): BlueprintDocument {
  const raw = parseToml(contents) as RawToml;
  if (!raw.meta) {
    throw new Error('Blueprint TOML must include a [meta] section.');
  }

  const inputs = Array.isArray(raw.inputs) ? raw.inputs.map(parseInput) : [];
  if (!Array.isArray(raw.artifacts)) {
    throw new Error('Blueprint TOML must include at least one [[artifacts]] entry.');
  }
  const artefacts = raw.artifacts.map(parseArtefact);
  const subBlueprints = Array.isArray(raw.subBlueprints)
    ? raw.subBlueprints.map(parseSubBlueprint)
    : [];
  const edges = Array.isArray(raw.graph?.edges)
    ? raw.graph!.edges!.map(parseEdge)
    : [];
  const producersRaw = Array.isArray(raw.producers)
    ? raw.producers
    : Array.isArray(raw.Producers)
      ? raw.Producers
      : [];
  const producers = producersRaw.map(parseProducer);

  return {
    meta: parseMeta(raw.meta),
    inputs,
    artefacts,
    subBlueprints,
    edges,
    producers,
  };
}

function parseMeta(raw: unknown): BlueprintDocument['meta'] {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid [meta] section.');
  }
  const meta = raw as Record<string, unknown>;
  const id = typeof meta.id === 'string' && meta.id.trim().length > 0 ? meta.id.trim() : null;
  const name = typeof meta.name === 'string' && meta.name.trim().length > 0 ? meta.name.trim() : null;
  if (!id || !name) {
    throw new Error('meta.id and meta.name must be non-empty strings.');
  }
  return {
    id,
    name,
    version: meta.version ? String(meta.version) : undefined,
    description: meta.description ? String(meta.description) : undefined,
    author: meta.author ? String(meta.author) : undefined,
    license: meta.license ? String(meta.license) : undefined,
  };
}

function parseInput(raw: unknown): BlueprintInputDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid [[inputs]] entry: ${JSON.stringify(raw)}`);
  }
  const input = raw as Record<string, unknown>;
  const name = readString(input, 'name');
  const type = readString(input, 'type');
  const required = input.required === false ? false : true;
  const description = typeof input.description === 'string' ? input.description : undefined;
  const defaultValue = input.default ?? input.defaultValue;
  if (!required && defaultValue === undefined) {
    throw new Error(`Optional input "${name}" must declare a default value.`);
  }
  return {
    name,
    type,
    required,
    description,
    defaultValue,
  };
}

function parseArtefact(raw: unknown): BlueprintArtefactDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid [[artifacts]] entry: ${JSON.stringify(raw)}`);
  }
  const artefact = raw as Record<string, unknown>;
  const name = readString(artefact, 'name');
  const type = readString(artefact, 'type');
  return {
    name,
    type,
    description: typeof artefact.description === 'string' ? artefact.description : undefined,
    itemType: typeof artefact.itemType === 'string' ? artefact.itemType : undefined,
    countInput: typeof artefact.countInput === 'string' ? artefact.countInput : undefined,
    required: artefact.required === false ? false : true,
  };
}

function parseSubBlueprint(raw: unknown): SubBlueprintDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid [[subBlueprints]] entry: ${JSON.stringify(raw)}`);
  }
  const entry = raw as Record<string, unknown>;
  const name = readString(entry, 'name');
  return {
    name,
    path: typeof entry.path === 'string' ? entry.path : undefined,
    description: typeof entry.description === 'string' ? entry.description : undefined,
  };
}

function parseEdge(raw: unknown): BlueprintEdgeDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid edge entry: ${JSON.stringify(raw)}`);
  }
  const edge = raw as Record<string, unknown>;
  const from = readString(edge, 'from');
  const to = readString(edge, 'to');
  return {
    from,
    to,
    note: typeof edge.note === 'string' ? edge.note : undefined,
  };
}

function parseProducer(raw: unknown): ProducerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid [[producers]] entry: ${JSON.stringify(raw)}`);
  }
  const producer = raw as Record<string, unknown>;
  const name = readString(producer, 'name');
  const provider = readString(producer, 'provider').toLowerCase();
  const model = readString(producer, 'model');

  const config: ProducerConfig = {
    name,
    provider: provider as ProducerConfig['provider'],
    model,
  };

  if (producer.settings && typeof producer.settings === 'object') {
    config.settings = producer.settings as Record<string, unknown>;
  }
  if (producer.systemPrompt) {
    config.systemPrompt = String(producer.systemPrompt);
  }
  if (producer.userPrompt) {
    config.userPrompt = String(producer.userPrompt);
  }
  if (producer.jsonSchema) {
    config.jsonSchema = String(producer.jsonSchema);
  }
  if (producer.textFormat) {
    config.textFormat = String(producer.textFormat);
  }
  if (Array.isArray(producer.variables)) {
    config.variables = producer.variables.map(String);
  }

  const sdkMapping = parseSdkMappingTable(producer.sdkMapping);
  if (sdkMapping) {
    config.sdkMapping = sdkMapping;
  }

  const outputs = parseOutputsTable(producer.outputs);
  if (outputs) {
    config.outputs = outputs;
  }

  const mergedConfig = mergeConfigTables(producer.config);
  if (Object.keys(mergedConfig).length > 0) {
    config.config = mergedConfig;
  }

  const known = new Set([
    'name',
    'provider',
    'model',
    'settings',
    'systemPrompt',
    'userPrompt',
    'jsonSchema',
    'textFormat',
    'variables',
    'sdkMapping',
    'outputs',
    'config',
  ]);
  for (const [key, value] of Object.entries(producer)) {
    if (!known.has(key)) {
      (config as Record<string, unknown>)[key] = value;
    }
  }

  return config;
}

function parseSdkMappingTable(raw: unknown): Record<string, BlueprintProducerSdkMappingField> | undefined {
  if (!Array.isArray(raw) || raw.length === 0) {
    return undefined;
  }
  const mapping: Record<string, BlueprintProducerSdkMappingField> = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    for (const [key, value] of Object.entries(entry)) {
      if (!value || typeof value !== 'object') {
        continue;
      }
      const record = value as Record<string, unknown>;
      const field = readString(record, 'field', `producers.sdkMapping.${key}.field`);
      mapping[key] = {
        field,
        type: typeof record.type === 'string' ? record.type : undefined,
        required: record.required === undefined ? undefined : Boolean(record.required),
      };
    }
  }
  return Object.keys(mapping).length > 0 ? mapping : undefined;
}

function parseOutputsTable(raw: unknown): Record<string, BlueprintProducerOutputDefinition> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  const outputs: Record<string, BlueprintProducerOutputDefinition> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const entry = value as Record<string, unknown>;
    outputs[key] = {
      type: readString(entry, 'type', `producers.outputs.${key}.type`),
      mimeType: typeof entry.mimeType === 'string' ? entry.mimeType : undefined,
    };
  }
  return Object.keys(outputs).length > 0 ? outputs : undefined;
}

function mergeConfigTables(raw: unknown): Record<string, unknown> {
  if (!Array.isArray(raw)) {
    return {};
  }
  const merged: Record<string, unknown> = {};
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    Object.assign(merged, entry as Record<string, unknown>);
  }
  return merged;
}

function readString(
  source: Record<string, unknown>,
  key: string,
  label: string = key,
): string {
  const value = source[key];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected non-empty string for "${label}".`);
  }
  return value.trim();
}
