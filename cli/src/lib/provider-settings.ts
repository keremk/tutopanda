import { dirname, resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { parse as parseToml } from 'smol-toml';
import type {
  ProducerCatalog,
  ProducerCatalogEntry,
  ProducerKind,
  ProviderName,
  ProjectConfig,
} from 'tutopanda-core';
import {
  parseProjectConfig,
  parseProjectConfigPartial,
  createDefaultProjectConfig,
} from 'tutopanda-core';
import type { ProviderAttachment, ProviderEnvironment } from 'tutopanda-providers';

const KNOWN_PRODUCERS: readonly ProducerKind[] = [
  'ScriptProducer',
  'TextToMusicPromptProducer',
  'TextToMusicProducer',
  'AudioProducer',
  'TextToImagePromptProducer',
  'TextToImageProducer',
  'TextToVideoPromptProducer',
  'TextToVideoProducer',
  'ImageToVideoPromptProducer',
  'StartImageProducer',
  'ImageToVideoProducer',
  'TimelineAssembler',
];

const KNOWN_PROVIDER_NAMES: readonly ProviderName[] = [
  'openai',
  'replicate',
  'elevenlabs',
  'fal',
  'custom',
  'internal',
];

interface RawSettings {
  general?: unknown;
  producers?: RawProducerSetting[];
  [key: string]: unknown;
}

interface RawProducerSetting {
  producer: string;
  providers: RawProviderOption[];
}

interface RawProviderOption {
  priority?: string;
  provider: string;
  model: string;
  environment?: string;
  configFile?: string;
  customAttributes?: Record<string, unknown>;
}

export interface LoadedProviderOption {
  priority: 'main' | 'fallback';
  provider: ProviderName;
  model: string;
  environment: ProviderEnvironment;
  config?: unknown;
  attachments: ProviderAttachment[];
  customAttributes?: Record<string, unknown>;
  sourcePath?: string;
}

export type ProviderOptionsMap = Map<ProducerKind, LoadedProviderOption[]>;

export interface LoadedSettings {
  projectConfig: ProjectConfig;
  providerOptions: ProviderOptionsMap;
}

export async function loadSettings(path: string): Promise<LoadedSettings> {
  const absolute = resolve(path);
  const directory = dirname(absolute);
  const rawText = await readFile(absolute, 'utf8');
  const raw = JSON.parse(rawText) as RawSettings;

  const general = parseProjectConfig(raw.general ?? {});
  const options = await loadProviderOptions(raw.producers ?? [], directory);

  return { projectConfig: general, providerOptions: options };
}

export async function loadSettingsOverrides(path: string): Promise<{
  projectConfig: Partial<ProjectConfig>;
  providerOptions: ProviderOptionsMap;
}> {
  const absolute = resolve(path);
  const directory = dirname(absolute);
  const rawText = await readFile(absolute, 'utf8');
  const raw = JSON.parse(rawText) as RawSettings;

  const generalOverride = parseProjectConfigPartial(raw.general ?? {});
  const options = await loadProviderOptions(raw.producers ?? [], directory);

  return { projectConfig: generalOverride, providerOptions: options };
}

export function mergeProviderOptions(
  base: ProviderOptionsMap,
  overrides: ProviderOptionsMap,
): ProviderOptionsMap {
  const merged = new Map(base);
  for (const [producer, entries] of overrides) {
    merged.set(producer, entries);
  }
  return merged;
}

export function applyProviderShortcutOverrides(
  providerOptions: ProviderOptionsMap,
  overrides: { voice?: string },
): ProviderOptionsMap {
  if (overrides.voice) {
    const audioOptions = providerOptions.get('AudioProducer');
    if (audioOptions) {
      const nextOptions = audioOptions.map((option) => ({
        ...option,
        customAttributes: {
          ...(option.customAttributes ?? {}),
          voice: overrides.voice,
        },
      }));
      const updated = new Map(providerOptions);
      updated.set('AudioProducer', nextOptions);
      return updated;
    }
  }

  return providerOptions;
}

export function buildProducerCatalog(
  providerOptions: ProviderOptionsMap,
): ProducerCatalog {
  const catalog: Partial<ProducerCatalog> = {};
  for (const producer of KNOWN_PRODUCERS) {
    const options = providerOptions.get(producer);
    if (!options || options.length === 0) {
      throw new Error(`No provider configuration defined for producer "${producer}".`);
    }
    const primary = selectPrimaryOption(options);
    catalog[producer] = createCatalogEntry(primary);
  }
  return catalog as ProducerCatalog;
}

export function providerOptionsToJSON(options: ProviderOptionsMap): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [producer, entries] of options) {
    result[producer] = entries.map((entry) => ({
      priority: entry.priority,
      provider: entry.provider,
      model: entry.model,
      environment: entry.environment,
      config: entry.config,
      attachments: entry.attachments,
      customAttributes: entry.customAttributes,
      sourcePath: entry.sourcePath,
    }));
  }
  return result;
}

export function providerOptionsFromJSON(json: unknown): ProviderOptionsMap {
  const map: ProviderOptionsMap = new Map();
  if (!json || typeof json !== 'object') {
    return map;
  }
  for (const [producer, value] of Object.entries(json as Record<string, unknown>)) {
    if (!isProducerKind(producer) || !Array.isArray(value)) {
      continue;
    }
    const entries: LoadedProviderOption[] = [];
    for (const item of value) {
      if (!isRecord(item)) {
        continue;
      }
      const providerName = typeof item.provider === 'string' ? item.provider : undefined;
      if (!isProviderName(providerName) || typeof item.model !== 'string') {
        continue;
      }
      const environmentValue =
        typeof item.environment === 'string' ? item.environment : undefined;

      entries.push({
        priority: item.priority === 'fallback' ? 'fallback' : 'main',
        provider: providerName,
        model: item.model,
        environment: normalizeEnvironment(environmentValue),
        config: item.config,
        attachments: Array.isArray(item.attachments)
          ? item.attachments
              .map(normalizeStoredAttachment)
              .filter((attachment): attachment is ProviderAttachment => Boolean(attachment))
          : [],
        customAttributes: isRecord(item.customAttributes)
          ? (item.customAttributes as Record<string, unknown>)
          : undefined,
        sourcePath: typeof item.sourcePath === 'string' ? item.sourcePath : undefined,
      });
    }
    if (entries.length > 0) {
      map.set(producer, entries);
    }
  }
  return map;
}

export function collectRequiredProducers(options: ProviderOptionsMap): ProducerKind[] {
  return Array.from(options.keys());
}

function createCatalogEntry(option: LoadedProviderOption): ProducerCatalogEntry {
  return {
    provider: option.provider,
    providerModel: option.model,
    rateKey: `${option.provider}:${option.model}`,
    costClass: undefined,
    medianLatencySec: undefined,
  };
}

function selectPrimaryOption(options: LoadedProviderOption[]): LoadedProviderOption {
  const main = options.find((option) => option.priority === 'main');
  return main ?? options[0]!
}

async function loadProviderOptions(
  raw: RawProducerSetting[],
  baseDir: string,
): Promise<ProviderOptionsMap> {
  const map: ProviderOptionsMap = new Map();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (!isProducerKind(entry.producer)) {
      continue;
    }
    const options: LoadedProviderOption[] = [];
    for (const option of entry.providers ?? []) {
      const loaded = await loadProviderOption(option, baseDir);
      if (loaded) {
        options.push(loaded);
      }
    }
    if (options.length > 0) {
      map.set(entry.producer as ProducerKind, options);
    }
  }
  return map;
}

async function loadProviderOption(
  raw: RawProviderOption,
  baseDir: string,
): Promise<LoadedProviderOption | undefined> {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }
  if (!isProviderName(raw.provider) || typeof raw.model !== 'string') {
    return undefined;
  }

  const priority = raw.priority === 'fallback' ? 'fallback' : 'main';
  const environment = normalizeEnvironment(raw.environment);

  let config: unknown;
  const attachments: ProviderAttachment[] = [];
  let resolvedPath: string | undefined;
  if (raw.configFile) {
    const { parsed, attachment, sourcePath } = await loadConfigFile(baseDir, raw.configFile);
    config = parsed;
    attachments.push(attachment);
    resolvedPath = sourcePath;
  }

  return {
    priority,
    provider: raw.provider,
    model: raw.model,
    environment,
    config,
    attachments,
    customAttributes: raw.customAttributes,
    sourcePath: resolvedPath,
  };
}

async function loadConfigFile(baseDir: string, relativePath: string) {
  const sourcePath = resolve(baseDir, relativePath);
  const contents = await readFile(sourcePath, 'utf8');
  const extension = relativePath.toLowerCase();

  if (extension.endsWith('.toml')) {
    const parsed = parseToml(contents);
    return {
      parsed,
      attachment: {
        name: relativePath,
        contents,
        format: 'toml',
      } as ProviderAttachment,
      sourcePath,
    };
  }

  if (extension.endsWith('.json')) {
    const parsed = JSON.parse(contents) as unknown;
    return {
      parsed,
      attachment: {
        name: relativePath,
        contents,
        format: 'json',
      } as ProviderAttachment,
      sourcePath,
    };
  }

  return {
    parsed: contents,
    attachment: {
      name: relativePath,
      contents,
      format: 'text',
    } as ProviderAttachment,
    sourcePath,
  };
}

function normalizeStoredAttachment(value: unknown): ProviderAttachment | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const { name, contents, format } = value;
  if (typeof name !== 'string' || typeof contents !== 'string') {
    return undefined;
  }
  if (format !== 'json' && format !== 'toml' && format !== 'text') {
    return undefined;
  }
  return { name, contents, format };
}

function normalizeEnvironment(value: string | undefined): ProviderEnvironment {
  return value === 'cloud' ? 'cloud' : 'local';
}

function isProducerKind(value: string | undefined): value is ProducerKind {
  return typeof value === 'string' && (KNOWN_PRODUCERS as readonly string[]).includes(value);
}

function isProviderName(value: string | undefined): value is ProviderName {
  return typeof value === 'string' && (KNOWN_PROVIDER_NAMES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export async function writeDefaultSettings(path: string): Promise<void> {
  const settingsDir = dirname(path);
  const defaultConfig = createDefaultProjectConfig();
  const settings = {
    general: defaultConfig,
    producers: DEFAULT_PRODUCERS,
  } satisfies RawSettings;
  await writeFile(path, `${JSON.stringify(settings, null, 2)}\n`, 'utf8');
  await writeDefaultConfigFiles(settingsDir);
}

const DEFAULT_PRODUCERS: RawProducerSetting[] = [
  {
    producer: 'ScriptProducer',
    providers: [
      {
        priority: 'main',
        provider: 'openai',
        model: 'openai/gpt5',
        environment: 'cloud',
        configFile: 'script-producer.toml',
      },
    ],
  },
  {
    producer: 'TextToMusicPromptProducer',
    providers: [
      {
        priority: 'main',
        provider: 'openai',
        model: 'openai/gpt5-mini',
        environment: 'cloud',
        configFile: 'text-to-music-prompt-producer.toml',
      },
    ],
  },
  {
    producer: 'TextToMusicProducer',
    providers: [
      {
        priority: 'main',
        provider: 'replicate',
        model: 'stability-ai/stable-audio-2.5',
        environment: 'cloud',
      },
    ],
  },
  {
    producer: 'AudioProducer',
    providers: [
      {
        priority: 'main',
        provider: 'replicate',
        model: 'minimax/speech-02-hd',
        environment: 'cloud',
      },
      {
        priority: 'fallback',
        provider: 'replicate',
        model: 'elevenlabs/v3',
        environment: 'cloud',
      },
    ],
  },
  {
    producer: 'TextToImagePromptProducer',
    providers: [
      {
        priority: 'main',
        provider: 'openai',
        model: 'openai/gpt5-mini',
        environment: 'cloud',
        configFile: 'text-to-image-prompt-producer.toml',
      },
    ],
  },
  {
    producer: 'TextToImageProducer',
    providers: [
      {
        priority: 'main',
        provider: 'replicate',
        model: 'bytedance/seedream-4',
        environment: 'cloud',
      },
    ],
  },
  {
    producer: 'TextToVideoPromptProducer',
    providers: [
      {
        priority: 'main',
        provider: 'openai',
        model: 'openai/gpt5-mini',
        environment: 'cloud',
        configFile: 'text-to-video-prompt-producer.toml',
      },
    ],
  },
  {
    producer: 'TextToVideoProducer',
    providers: [
      {
        priority: 'main',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        environment: 'cloud',
      },
      {
        priority: 'fallback',
        provider: 'replicate',
        model: 'bytedance/seedance-1-lite',
        environment: 'cloud',
      },
    ],
  },
  {
    producer: 'ImageToVideoPromptProducer',
    providers: [
      {
        priority: 'main',
        provider: 'openai',
        model: 'openai/gpt5-mini',
        environment: 'cloud',
        configFile: 'image-to-video-prompt-producer.toml',
      },
    ],
  },
  {
    producer: 'StartImageProducer',
    providers: [
      {
        priority: 'main',
        provider: 'replicate',
        model: 'bytedance/seedream-4',
        environment: 'cloud',
      },
    ],
  },
  {
    producer: 'ImageToVideoProducer',
    providers: [
      {
        priority: 'main',
        provider: 'replicate',
        model: 'bytedance/seedance-1-pro-fast',
        environment: 'cloud',
      },
    ],
  },
  {
    producer: 'TimelineAssembler',
    providers: [
      {
        priority: 'main',
        provider: 'internal',
        model: 'tutopanda/timeline-assembler',
        environment: 'local',
      },
    ],
  },
];

async function writeDefaultConfigFiles(settingsDir: string): Promise<void> {
  const files: Record<string, string> = {
    'script-producer.toml': DEFAULT_SCRIPT_PROMPT,
    'text-to-music-prompt-producer.toml': DEFAULT_TEXT_TO_MUSIC_PROMPT,
    'text-to-image-prompt-producer.toml': DEFAULT_TEXT_TO_IMAGE_PROMPT,
    'text-to-video-prompt-producer.toml': DEFAULT_TEXT_TO_VIDEO_PROMPT,
    'image-to-video-prompt-producer.toml': DEFAULT_IMAGE_TO_VIDEO_PROMPT,
  };

  for (const [fileName, contents] of Object.entries(files)) {
    const targetPath = resolve(settingsDir, fileName);
    try {
      await writeFile(targetPath, contents, { flag: 'wx' });
    } catch {
      // ignore if file already exists
    }
  }
}

const DEFAULT_SCRIPT_PROMPT = `# Script Producer Configuration
[system_prompt]
textFormat = "json_schema"
jsonSchema = """
{
  "name": "script_generation",
  "strict": true,
  "reasoning": "low",
  "schema": {
    "type": "object",
    "properties": {
      "movie_title": { "type": "string" },
      "movie_summary": { "type": "string" },
      "segments": {
        "type": "array",
        "items": { "type": "string" }
      }
    },
    "required": ["movie_title", "movie_summary", "segments"],
    "additionalProperties": false
  }
}
"""
variables = "audience,style,language"
systemPrompt = """
You are a storytelling assistant. Use the provided audience, style, and language to craft an engaging video narration.
"""
`;

const DEFAULT_TEXT_TO_MUSIC_PROMPT = `# Text to Music Prompt Configuration
[system_prompt]
textFormat = "text"
systemPrompt = """
Create a concise descriptive prompt for background music that matches the video's theme and pace.
"""
`;

const DEFAULT_TEXT_TO_IMAGE_PROMPT = `# Text to Image Prompt Configuration
[system_prompt]
textFormat = "text"
systemPrompt = """
Generate a vivid scene description suitable for high-quality illustration.
"""
`;

const DEFAULT_TEXT_TO_VIDEO_PROMPT = `# Text to Video Prompt Configuration
[system_prompt]
textFormat = "text"
systemPrompt = """
Describe the motion and imagery for a 10-second video segment.
"""
`;

const DEFAULT_IMAGE_TO_VIDEO_PROMPT = `# Image to Video Prompt Configuration
[system_prompt]
textFormat = "json_schema"
jsonSchema = """
{
  "name": "segment_image_movie_description",
  "strict": true,
  "reasoning": "low",
  "schema": {
    "type": "object",
    "properties": {
      "segment_start_image": { "type": "string" },
      "movie_directions": { "type": "string" }
    },
    "required": ["segment_start_image", "movie_directions"],
    "additionalProperties": false
  }
}
"""
variables = "foo,bar"
tools = "WebSearch"
systemPrompt = """
You are an expert in {foo}. You should generate {bar}.
"""
`;
