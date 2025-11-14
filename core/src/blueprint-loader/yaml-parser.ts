import { parse as parseToml } from 'smol-toml';
import { parse as parseYaml } from 'yaml';
import { promises as fs } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import type { FileStorage } from '@flystorage/file-storage';
import type {
  BlueprintArtefactDefinition,
  BlueprintDocument,
  BlueprintEdgeDefinition,
  BlueprintInputDefinition,
  BlueprintProducerOutputDefinition,
  BlueprintProducerSdkMappingField,
  BlueprintTreeNode,
  ProducerConfig,
  SubBlueprintDefinition,
} from '../types.js';

export interface BlueprintResourceReader {
  readFile(path: string): Promise<string>;
}

export interface BlueprintParseOptions {
  reader?: BlueprintResourceReader;
}

export interface BlueprintLoadOptions extends BlueprintParseOptions {}

class NodeFilesystemReader implements BlueprintResourceReader {
  async readFile(path: string): Promise<string> {
    return fs.readFile(path, 'utf8');
  }
}

const defaultReader = new NodeFilesystemReader();

export function createFlyStorageBlueprintReader(
  storage: FileStorage,
  rootDir: string,
): BlueprintResourceReader {
  const normalizedRoot = resolve(rootDir);
  return {
    async readFile(target: string): Promise<string> {
      const absolute = resolve(target);
      if (!absolute.startsWith(normalizedRoot)) {
        throw new Error(
          `Blueprint path "${target}" is outside configured root "${normalizedRoot}".`,
        );
      }
      const relativePath = relativePosix(normalizedRoot, absolute);
      return storage.readToString(relativePath);
    },
  };
}

export async function parseYamlBlueprintFile(
  filePath: string,
  options: BlueprintParseOptions = {},
): Promise<BlueprintDocument> {
  const reader = options.reader ?? defaultReader;
  const absolute = resolve(filePath);
  const contents = await reader.readFile(absolute);
  const raw = parseYaml(contents) as RawBlueprint;
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Blueprint YAML at ${filePath} must be a YAML document.`);
  }
  const baseDir = dirname(absolute);

  const inputs = Array.isArray(raw.inputs) ? raw.inputs.map((entry) => parseInput(entry)) : [];
  const loops = Array.isArray(raw.loops) ? parseLoops(raw.loops) : [];
  const loopSymbols = new Set(loops.map((loop) => loop.name));
  const artefactSource = Array.isArray(raw.artifacts)
    ? raw.artifacts
    : Array.isArray(raw.artefacts)
      ? raw.artefacts
      : [];
  if (artefactSource.length === 0) {
    throw new Error(`Blueprint YAML at ${filePath} must declare at least one artifact.`);
  }
  const artefacts = artefactSource.map((entry) => parseArtefact(entry));
  const modules = Array.isArray(raw.modules)
    ? raw.modules.map((entry) => parseModule(entry))
    : [];
  const edges = Array.isArray(raw.connections)
    ? raw.connections.map((entry) => parseEdge(entry, loopSymbols))
    : [];
  const producers = Array.isArray(raw.producers)
    ? await parseProducers(raw.producers, baseDir, reader)
    : [];

  return {
    meta: parseMeta(raw.meta, filePath),
    inputs,
    artefacts,
    producers,
    subBlueprints: modules,
    edges,
  };
}

export async function loadYamlBlueprintTree(
  entryPath: string,
  options: BlueprintLoadOptions = {},
): Promise<{ root: BlueprintTreeNode }> {
  const reader = options.reader ?? defaultReader;
  const absolute = resolve(entryPath);
  const visiting = new Set<string>();
  const root = await loadNode(absolute, [], reader, visiting);
  return { root };
}

async function loadNode(
  filePath: string,
  namespacePath: string[],
  reader: BlueprintResourceReader,
  visiting: Set<string>,
): Promise<BlueprintTreeNode> {
  const absolute = resolve(filePath);
  if (visiting.has(absolute)) {
    throw new Error(`Detected circular blueprint reference at ${absolute}`);
  }
  visiting.add(absolute);
  const document = await parseYamlBlueprintFile(absolute, { reader });
  const node: BlueprintTreeNode = {
    id: document.meta.id,
    namespacePath,
    document,
    children: new Map(),
  };

  for (const sub of document.subBlueprints) {
    const subNamespace = [...namespacePath, sub.name];
    const childPath = resolveSubBlueprintPath(absolute, sub);
    const child = await loadNode(childPath, subNamespace, reader, visiting);
    if (child.id !== sub.name) {
      throw new Error(
        `Sub-blueprint id mismatch for ${sub.name}: expected "${sub.name}" but file declared "${child.id}".`,
      );
    }
    node.children.set(sub.name, child);
  }

  visiting.delete(absolute);
  return node;
}

function resolveSubBlueprintPath(parentFile: string, sub: SubBlueprintDefinition): string {
  const directory = dirname(parentFile);
  if (sub.path) {
    return resolve(directory, sub.path);
  }
  return resolve(directory, `${sub.name}.yaml`);
}

interface RawBlueprint {
  meta?: unknown;
  inputs?: unknown[];
  artifacts?: unknown[];
  artefacts?: unknown[];
  modules?: unknown[];
  connections?: unknown[];
  producers?: unknown[];
}

function parseMeta(raw: unknown, filePath: string): BlueprintDocument['meta'] {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Blueprint YAML at ${filePath} must include a meta section.`);
  }
  const meta = raw as Record<string, unknown>;
  const id = readString(meta, 'id');
  const name = readString(meta, 'name');
  return {
    id,
    name,
    version: meta.version ? String(meta.version) : undefined,
    description: meta.description ? String(meta.description) : undefined,
    author: meta.author ? String(meta.author) : undefined,
    license: meta.license ? String(meta.license) : undefined,
  };
}

function parseLoops(rawLoops: unknown[]): Array<{ name: string; parent?: string; countInput: string }> {
  const loops: Array<{ name: string; parent?: string; countInput: string }> = [];
  const seen = new Set<string>();
  for (const raw of rawLoops) {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid loop entry: ${JSON.stringify(raw)}`);
    }
    const loop = raw as Record<string, unknown>;
    const name = readString(loop, 'name');
    if (seen.has(name)) {
      throw new Error(`Duplicate loop name "${name}".`);
    }
    const parent = loop.parent ? readString(loop, 'parent') : undefined;
    const countInput = readString(loop, 'countInput');
    loops.push({ name, parent, countInput });
    seen.add(name);
  }
  return loops;
}

function parseInput(raw: unknown): BlueprintInputDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid input entry: ${JSON.stringify(raw)}`);
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
    throw new Error(`Invalid artifact entry: ${JSON.stringify(raw)}`);
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

function parseModule(raw: unknown): SubBlueprintDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid module entry: ${JSON.stringify(raw)}`);
  }
  const entry = raw as Record<string, unknown>;
  const name = readString(entry, 'name');
  return {
    name,
    path: typeof entry.path === 'string' ? entry.path : undefined,
    description: typeof entry.description === 'string' ? entry.description : undefined,
    loop: typeof entry.loop === 'string' ? entry.loop.trim() : undefined,
  };
}

function parseEdge(raw: unknown, allowedDimensions: Set<string>): BlueprintEdgeDefinition {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`Invalid connection entry: ${JSON.stringify(raw)}`);
  }
  const edge = raw as Record<string, unknown>;
  const from = normalizeReference(readString(edge, 'from'));
  const to = normalizeReference(readString(edge, 'to'));
  validateDimensions(from, allowedDimensions, 'from');
  validateDimensions(to, allowedDimensions, 'to');
  return {
    from,
    to,
    note: typeof edge.note === 'string' ? edge.note : undefined,
  };
}

async function parseProducers(
  rawProducers: unknown[],
  baseDir: string,
  reader: BlueprintResourceReader,
): Promise<ProducerConfig[]> {
  const producers: ProducerConfig[] = [];
  for (const raw of rawProducers) {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`Invalid producer entry: ${JSON.stringify(raw)}`);
    }
    const entry = raw as Record<string, unknown>;
    const name = readString(entry, 'name');
    const provider = readString(entry, 'provider').toLowerCase();
    const promptFile = typeof entry.promptFile === 'string' ? entry.promptFile : undefined;
    const promptConfig = promptFile
      ? await loadPromptConfig(resolve(baseDir, promptFile), reader)
      : {};

    const model = typeof entry.model === 'string' ? entry.model : promptConfig.model;
    if (!model) {
      throw new Error(`Producer "${name}" must specify a model (directly or in promptFile).`);
    }

    const settings = mergeRecords(promptConfig.settings, entry.settings);
    const textFormat = typeof entry.textFormat === 'string' ? entry.textFormat : promptConfig.textFormat;
    const variables = Array.isArray(entry.variables)
      ? entry.variables.map(String)
      : promptConfig.variables;

    const jsonSchemaSource = entry.jsonSchema ?? promptConfig.jsonSchema;
    const jsonSchema = await loadJsonSchema(jsonSchemaSource, baseDir, reader);

    const producer: ProducerConfig = {
      name,
      provider: provider as ProducerConfig['provider'],
      model,
      settings,
      systemPrompt: typeof entry.systemPrompt === 'string'
        ? entry.systemPrompt
        : promptConfig.systemPrompt,
      userPrompt: typeof entry.userPrompt === 'string' ? entry.userPrompt : promptConfig.userPrompt,
      textFormat,
      variables,
    };

    if (jsonSchema) {
      producer.jsonSchema = jsonSchema;
    }

    const sdkMapping = parseSdkMapping(entry.sdkMapping ?? promptConfig.sdkMapping);
    if (sdkMapping) {
      producer.sdkMapping = sdkMapping;
    }

    const outputs = parseOutputs(entry.outputs ?? promptConfig.outputs);
    if (outputs) {
      producer.outputs = outputs;
    }

    if (entry.config && typeof entry.config === 'object') {
      producer.config = entry.config as Record<string, unknown>;
    } else if (promptConfig.config) {
      producer.config = promptConfig.config;
    }

    producers.push(producer);
  }
  return producers;
}

function parseSdkMapping(raw: unknown): Record<string, BlueprintProducerSdkMappingField> | undefined {
  if (!raw) {
    return undefined;
  }
  if (typeof raw !== 'object') {
    throw new Error(`Invalid sdkMapping entry: ${JSON.stringify(raw)}`);
  }
  const table = raw as Record<string, unknown>;
  const mapping: Record<string, BlueprintProducerSdkMappingField> = {};
  for (const [key, value] of Object.entries(table)) {
    if (!value || typeof value !== 'object') {
      throw new Error(`Invalid sdkMapping field for ${key}.`);
    }
    const fieldConfig = value as Record<string, unknown>;
    mapping[key] = {
      field: readString(fieldConfig, 'field'),
      type: typeof fieldConfig.type === 'string' ? fieldConfig.type : undefined,
      required: fieldConfig.required === true ? true : fieldConfig.required === false ? false : undefined,
    };
  }
  return Object.keys(mapping).length ? mapping : undefined;
}

function parseOutputs(raw: unknown): Record<string, BlueprintProducerOutputDefinition> | undefined {
  if (!raw) {
    return undefined;
  }
  if (typeof raw !== 'object') {
    throw new Error(`Invalid outputs entry: ${JSON.stringify(raw)}`);
  }
  const table = raw as Record<string, unknown>;
  const outputs: Record<string, BlueprintProducerOutputDefinition> = {};
  for (const [key, value] of Object.entries(table)) {
    if (!value || typeof value !== 'object') {
      throw new Error(`Invalid producer output entry for ${key}.`);
    }
    const output = value as Record<string, unknown>;
    outputs[key] = {
      type: readString(output, 'type'),
      mimeType: typeof output.mimeType === 'string' ? output.mimeType : undefined,
    };
  }
  return Object.keys(outputs).length ? outputs : undefined;
}

async function loadPromptConfig(
  promptPath: string,
  reader: BlueprintResourceReader,
): Promise<PromptConfig> {
  const contents = await reader.readFile(promptPath);
  const parsed = parseToml(contents) as Record<string, unknown>;
  const baseDir = dirname(promptPath);
  const prompt: PromptConfig = {};
  if (typeof parsed.model === 'string') {
    prompt.model = parsed.model;
  }
  if (typeof parsed.textFormat === 'string') {
    prompt.textFormat = parsed.textFormat;
  }
  if (parsed.settings && typeof parsed.settings === 'object') {
    prompt.settings = { ...(parsed.settings as Record<string, unknown>) };
  }
  if (Array.isArray(parsed.variables)) {
    prompt.variables = parsed.variables.map(String);
  }
  const settings = prompt.settings ?? {};
  const rootSystemPrompt = typeof parsed.systemPrompt === 'string' ? parsed.systemPrompt : undefined;
  const settingsSystemPrompt =
    typeof settings.systemPrompt === 'string' ? (settings.systemPrompt as string) : undefined;
  if (rootSystemPrompt || settingsSystemPrompt) {
    prompt.systemPrompt = rootSystemPrompt ?? settingsSystemPrompt;
    delete settings.systemPrompt;
  }
  const rootUserPrompt = typeof parsed.userPrompt === 'string' ? parsed.userPrompt : undefined;
  const settingsUserPrompt =
    typeof settings.userPrompt === 'string' ? (settings.userPrompt as string) : undefined;
  if (rootUserPrompt || settingsUserPrompt) {
    prompt.userPrompt = rootUserPrompt ?? settingsUserPrompt;
    delete settings.userPrompt;
  }
  prompt.settings = Object.keys(settings).length ? settings : undefined;
  if (parsed.config && typeof parsed.config === 'object') {
    prompt.config = parsed.config as Record<string, unknown>;
  }
  if (parsed.jsonSchema !== undefined) {
    prompt.jsonSchema = await loadJsonSchema(parsed.jsonSchema, baseDir, reader);
  }
  return prompt;
}

async function loadJsonSchema(
  source: unknown,
  baseDir: string,
  reader: BlueprintResourceReader,
): Promise<string | undefined> {
  if (source === undefined || source === null) {
    return undefined;
  }
  if (typeof source === 'object') {
    return JSON.stringify(source, null, 2);
  }
  const raw = String(source).trim();
  if (!raw) {
    return undefined;
  }
  if (raw.startsWith('{') || raw.startsWith('[')) {
    return JSON.stringify(JSON.parse(raw), null, 2);
  }
  const absolute = resolve(baseDir, raw);
  const contents = await reader.readFile(absolute);
  return JSON.stringify(JSON.parse(contents), null, 2);
}

function mergeRecords(
  base: Record<string, unknown> | undefined,
  override: unknown,
): Record<string, unknown> | undefined {
  if (!base && (!override || typeof override !== 'object')) {
    return base;
  }
  const result: Record<string, unknown> = { ...(base ?? {}) };
  if (override && typeof override === 'object') {
    Object.assign(result, override as Record<string, unknown>);
  }
  return Object.keys(result).length ? result : undefined;
}

function validateDimensions(reference: string, allowed: Set<string>, label: 'from' | 'to'): void {
  parseReference(reference, allowed, label);
}

function parseReference(reference: string, allowed: Set<string>, label: 'from' | 'to'): void {
  if (typeof reference !== 'string' || reference.trim().length === 0) {
    throw new Error(`Invalid ${label} reference "${reference}".`);
  }
  for (const segment of reference.split('.')) {
    const match = segment.match(/^[A-Za-z0-9_]+/);
    if (!match) {
      throw new Error(`Invalid ${label} reference "${reference}".`);
    }
    let remainder = segment.slice(match[0].length);
    while (remainder.length > 0) {
      if (!remainder.startsWith('[')) {
        throw new Error(`Invalid dimension syntax in ${label} reference "${reference}".`);
      }
      const closeIndex = remainder.indexOf(']');
      if (closeIndex === -1) {
        throw new Error(`Unclosed dimension in ${label} reference "${reference}".`);
      }
      const symbol = remainder.slice(1, closeIndex).trim();
      if (!symbol) {
        throw new Error(`Empty dimension in ${label} reference "${reference}".`);
      }
      if (!allowed.has(symbol)) {
        throw new Error(
          `Unknown dimension "${symbol}" in ${label} reference "${reference}". Declare it under loops[].`,
        );
      }
      remainder = remainder.slice(closeIndex + 1);
    }
  }
}

function normalizeReference(raw: string): string {
  return raw;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  throw new Error(`Expected string for "${key}"`);
}

function relativePosix(root: string, target: string): string {
  const rel = relative(root, target);
  if (rel.startsWith('..')) {
    throw new Error(`Path "${target}" escapes root "${root}".`);
  }
  return rel.split(sep).join('/');
}

interface PromptConfig {
  model?: string;
  textFormat?: string;
  jsonSchema?: string;
  variables?: string[];
  settings?: Record<string, unknown>;
  systemPrompt?: string;
  userPrompt?: string;
  config?: Record<string, unknown>;
  sdkMapping?: Record<string, BlueprintProducerSdkMappingField>;
  outputs?: Record<string, BlueprintProducerOutputDefinition>;
}
