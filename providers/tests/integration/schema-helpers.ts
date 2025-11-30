import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ProviderJobContext } from '../../src/types.js';

export type VideoModel =
  | 'bytedance/seedance-1-pro-fast'
  | 'bytedance/seedance-1-lite'
  | 'google/veo-3.1-fast';

type MappingEntry = { field: string; required?: boolean };

type ModelMapping = Record<string, MappingEntry>;

const schemaPaths: Record<VideoModel, string> = {
  'bytedance/seedance-1-pro-fast': '../../../cli/config/blueprints/modules/schemas/bytedance-seedance-1-pro-fast.json',
  'bytedance/seedance-1-lite': '../../../cli/config/blueprints/modules/schemas/bytedance-seedance-1-lite.json',
  'google/veo-3.1-fast': '../../../cli/config/blueprints/modules/schemas/google-veo-3-1-fast.json',
};

// Mirrors cli/config/blueprints/modules/producers/video.yaml input mappings
const modelMappings: Record<VideoModel, ModelMapping> = {
  'bytedance/seedance-1-pro-fast': {
    Prompt: { field: 'prompt', required: true },
    AspectRatio: { field: 'aspect_ratio', required: true },
    Resolution: { field: 'resolution', required: false },
    SegmentDuration: { field: 'duration', required: false },
  },
  'bytedance/seedance-1-lite': {
    Prompt: { field: 'prompt', required: true },
    AspectRatio: { field: 'aspect_ratio', required: true },
    Resolution: { field: 'resolution', required: false },
    SegmentDuration: { field: 'duration', required: false },
  },
  'google/veo-3.1-fast': {
    Prompt: { field: 'prompt', required: true },
    AspectRatio: { field: 'aspect_ratio', required: true },
    Resolution: { field: 'resolution', required: false },
    SegmentDuration: { field: 'duration', required: false },
  },
};

function resolveSchemaPath(model: VideoModel): string {
  const relative = schemaPaths[model];
  if (!relative) {
    throw new Error(`No schema path registered for model: ${model}`);
  }
  return resolve(new URL('.', import.meta.url).pathname, relative);
}

export function loadSchema(model: VideoModel): string {
  return readFileSync(resolveSchemaPath(model), 'utf-8');
}

export function getVideoMapping(model: VideoModel): ModelMapping {
  const mapping = modelMappings[model];
  if (!mapping) {
    throw new Error(`No mapping registered for model: ${model}`);
  }
  return mapping;
}

function mergeMappings(base: ModelMapping, extra?: ModelMapping): ModelMapping {
  return { ...base, ...(extra ?? {}) };
}

function computeMappingFromSchema(
  schemaText: string,
  mapping: ModelMapping,
): Record<string, MappingEntry> {
  const schema = JSON.parse(schemaText) as { properties?: Record<string, unknown> };
  const properties = schema.properties ?? {};

  const resolved: Record<string, MappingEntry> = {};
  for (const [alias, spec] of Object.entries(mapping)) {
    if (!(spec.field in properties)) {
      throw new Error(`Schema is missing expected field "${spec.field}" for alias "${alias}".`);
    }
    resolved[alias] = spec;
  }

  if (!resolved.Prompt) {
    throw new Error('Prompt mapping is required for video tests.');
  }

  return resolved;
}

export function buildVideoExtras(
  model: VideoModel,
  resolvedInputs: Record<string, unknown>,
  extraMapping?: ModelMapping,
): ProviderJobContext['context']['extras'] {
  const schemaText = loadSchema(model);
  const mapping = mergeMappings(modelMappings[model], extraMapping);
  const sdkMapping = computeMappingFromSchema(schemaText, mapping);

  const inputBindings: Record<string, string> = {};
  for (const alias of Object.keys(sdkMapping)) {
    inputBindings[alias] = `Input:${alias}`;
  }

  return {
    resolvedInputs,
    jobContext: {
      inputBindings,
      sdkMapping,
    },
    plannerContext: { index: { segment: 0 } },
    schema: { input: schemaText },
  };
}
