import { parse as parseToml } from 'smol-toml';
import type {
  Blueprint,
  BlueprintMeta,
  BlueprintInput,
  BlueprintOutput,
  SubBlueprintRef,
  BlueprintNode,
  UnresolvedBlueprintEdge,
  ProducerConfig,
  CardinalityTag,
  CardinalityDimension,
} from 'tutopanda-core';

/**
 * Raw TOML structure (unvalidated).
 */
interface RawToml {
  meta?: unknown;
  inputs?: unknown[];
  outputs?: unknown[];
  graph?: {
    subBlueprints?: unknown[];
    nodes?: unknown[];
    edges?: unknown[];
  };
  producers?: unknown[];
  Producers?: unknown[];
}

/**
 * Parse a TOML blueprint file into a Blueprint object.
 *
 * @param tomlContent - The raw TOML file content as a string
 * @returns Parsed Blueprint object
 */
export function parseBlueprintToml(tomlContent: string): Blueprint {
  const raw = parseToml(tomlContent) as RawToml;

  // Validate required sections
  if (!raw.meta) {
    throw new Error('Blueprint TOML must contain a [meta] section');
  }

  return {
    meta: parseMeta(raw.meta),
    inputs: Array.isArray(raw.inputs) ? raw.inputs.map(parseInput) : [],
    outputs: Array.isArray(raw.outputs) ? raw.outputs.map(parseOutput) : [],
    subBlueprints: raw.graph?.subBlueprints
      ? (Array.isArray(raw.graph.subBlueprints) ? raw.graph.subBlueprints.map(parseSubBlueprintRef) : [])
      : [],
    nodes: raw.graph?.nodes
      ? (Array.isArray(raw.graph.nodes) ? raw.graph.nodes.map(parseNode) : [])
      : [],
    edges: raw.graph?.edges
      ? (Array.isArray(raw.graph.edges) ? raw.graph.edges.map(parseEdge) : [])
      : [],
    producers: Array.isArray(raw.producers) ? raw.producers.map(parseProducer)
      : Array.isArray(raw.Producers) ? raw.Producers.map(parseProducer)
      : [],
  };
}

function parseMeta(raw: unknown): BlueprintMeta {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid meta section');
  }

  const meta = raw as Record<string, unknown>;

  if (typeof meta.id !== 'string' || typeof meta.name !== 'string') {
    throw new Error('meta.id and meta.name must be strings');
  }

  return {
    id: meta.id,
    name: meta.name,
    version: meta.version ? String(meta.version) : undefined,
    description: meta.description ? String(meta.description) : undefined,
    author: meta.author ? String(meta.author) : undefined,
    license: meta.license ? String(meta.license) : undefined,
  };
}

function parseInput(raw: unknown): BlueprintInput {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid input: ${JSON.stringify(raw)}`);
  }

  const input = raw as Record<string, unknown>;

  if (!input.name || !input.type || !input.cardinality) {
    throw new Error(
      `Blueprint input must have "name", "type", and "cardinality" fields. Got: ${JSON.stringify(raw)}`
    );
  }

  const required = Boolean(input.required);
  const defaultValue = input.default ?? input.defaultValue;
  if (!required && defaultValue === undefined) {
    throw new Error(
      `Optional input "${input.name}" must define a default value in the blueprint.`,
    );
  }

  return {
    name: String(input.name),
    type: String(input.type),
    cardinality: parseCardinality(input.cardinality),
    required,
    description: input.description ? String(input.description) : undefined,
    itemType: input.itemType ? String(input.itemType) : undefined,
    defaultValue,
  };
}

function parseOutput(raw: unknown): BlueprintOutput {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid output: ${JSON.stringify(raw)}`);
  }

  const output = raw as Record<string, unknown>;

  if (!output.name || !output.type || !output.cardinality) {
    throw new Error(
      `Blueprint output must have "name", "type", and "cardinality" fields. Got: ${JSON.stringify(raw)}`
    );
  }

  return {
    name: String(output.name),
    type: String(output.type),
    cardinality: parseCardinality(output.cardinality),
    required: Boolean(output.required),
    description: output.description ? String(output.description) : undefined,
    itemType: output.itemType ? String(output.itemType) : undefined,
  };
}

function parseSubBlueprintRef(raw: unknown): SubBlueprintRef {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid sub-blueprint reference: ${JSON.stringify(raw)}`);
  }

  const ref = raw as Record<string, unknown>;

  if (!ref.blueprintRef) {
    throw new Error(
      `Sub-blueprint reference must have "blueprintRef" field. Got: ${JSON.stringify(raw)}`
    );
  }

  return {
    id: String(ref.blueprintRef),
    blueprintId: String(ref.blueprintRef),  // Same value for both
    path: typeof ref.path === 'string' ? String(ref.path) : undefined,
  };
}

function parseNode(raw: unknown): BlueprintNode {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid node: ${JSON.stringify(raw)}`);
  }

  const node = raw as Record<string, unknown>;

  if (!node.cardinality) {
    throw new Error(
      `Blueprint node must have "cardinality" field. Got: ${JSON.stringify(raw)}`
    );
  }

  const cardinality = parseCardinality(node.cardinality);

  // Determine node type and create reference
  if (node.inputRef) {
    return {
      ref: { kind: 'InputSource', id: String(node.inputRef) },
      cardinality,
      label: node.label ? String(node.label) : undefined,
      description: node.description ? String(node.description) : undefined,
    };
  }

  if (node.producerRef) {
    return {
      ref: { kind: 'Producer', id: String(node.producerRef) },
      cardinality,
      label: node.label ? String(node.label) : undefined,
      description: node.description ? String(node.description) : undefined,
    };
  }

  if (node.outputRef) {
    return {
      ref: { kind: 'Artifact', id: String(node.outputRef) },
      cardinality,
      label: node.label ? String(node.label) : undefined,
      description: node.description ? String(node.description) : undefined,
    };
  }

  if (node.subBlueprintRef) {
    // Sub-blueprint reference node - this is a marker for where sub-blueprint is instantiated
    // We'll handle this differently in the flattening phase
    return {
      ref: { kind: 'Producer', id: String(node.subBlueprintRef) },
      cardinality,
      label: node.label ? String(node.label) : undefined,
      description: node.description ? String(node.description) : undefined,
    };
  }

  throw new Error(
    `Blueprint node must have one of: inputRef, producerRef, outputRef, or subBlueprintRef. Got: ${JSON.stringify(raw)}`
  );
}

function parseEdge(raw: unknown): UnresolvedBlueprintEdge {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid edge: ${JSON.stringify(raw)}`);
  }

  const edge = raw as Record<string, unknown>;

  if (!edge.from || !edge.to) {
    throw new Error(
      `Blueprint edge must have "from" and "to" fields. Got: ${JSON.stringify(raw)}`
    );
  }

  // Convert perSegment flag to dimensions array
  let dimensions: CardinalityDimension[] | undefined;
  if (edge.perSegment === true) {
    dimensions = ['segment'];
  } else if (edge.dimensions) {
    dimensions = Array.isArray(edge.dimensions) ? edge.dimensions as CardinalityDimension[] : [edge.dimensions as CardinalityDimension];
  }

  return {
    from: String(edge.from),  // Keep as string for now, will be resolved during flattening
    to: String(edge.to),
    dimensions,
    // fanOut is used for expansion logic, not stored in edge
    note: edge.note ? String(edge.note) : undefined,
  };
}

function parseProducer(raw: unknown): ProducerConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid producer: ${JSON.stringify(raw)}`);
  }

  const producer = raw as Record<string, unknown>;

  if (!producer.name || !producer.provider || !producer.model) {
    throw new Error(
      `Producer must have "name", "provider", and "model" fields. Got: ${JSON.stringify(raw)}`
    );
  }

  const providerName = String(producer.provider).toLowerCase();

  // Start with core fields
  const config: ProducerConfig = {
    name: String(producer.name),
    provider: providerName as 'openai' | 'replicate' | 'elevenlabs' | 'fal' | 'custom' | 'internal',
    model: String(producer.model),
  };

  // Add optional known fields
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

  // Copy all other attributes as-is (provider-specific attributes)
  const knownFields = new Set([
    'name', 'provider', 'model', 'settings',
    'systemPrompt', 'userPrompt', 'jsonSchema', 'textFormat', 'variables'
  ]);

  for (const [key, value] of Object.entries(producer)) {
    if (!knownFields.has(key)) {
      config[key] = value;
    }
  }

  return config;
}

function parseCardinality(value: unknown): CardinalityTag {
  const normalized = String(value).toLowerCase();

  if (normalized === 'single') return 'single';
  if (normalized === 'persegment') return 'perSegment';
  if (normalized === 'persegmentimage') return 'perSegmentImage';

  throw new Error(
    `Invalid cardinality value: "${value}". Must be one of: single, perSegment, perSegmentImage`
  );
}
