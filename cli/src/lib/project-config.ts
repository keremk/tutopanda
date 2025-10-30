import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  type BlueprintExpansionConfig,
  type InputValues,
  type ProjectConfig,
  parseProjectConfig,
} from 'tutopanda-core';

// eslint-disable-next-line no-unused-vars
type CloneFn = (value: any) => any;

export async function loadProjectConfig(configPath: string): Promise<ProjectConfig> {
  const raw = await readFile(resolve(configPath), 'utf8');
  return parseProjectConfig(JSON.parse(raw));
}

export function mergeProjectConfig(
  base: ProjectConfig,
  override: Partial<ProjectConfig>,
): ProjectConfig {
  const result = clone(base);
  deepMerge(result, override);
  return parseProjectConfig(result);
}

export function applyShortcutOverrides(
  config: ProjectConfig,
  overrides: {
    style?: string;
    voice?: string;
    useVideo?: boolean;
    audience?: string;
    language?: string;
    duration?: number;
    aspectRatio?: string;
    size?: string;
  },
): ProjectConfig {
  const next = clone(config);
  if (overrides.style) {
    next.General.Style = overrides.style as ProjectConfig['General']['Style'];
    if (overrides.style !== 'Custom') {
      next.General.CustomStyle = '';
    }
  }
  if (overrides.voice) {
    next.Audio.Voice = overrides.voice;
  }
  if (overrides.useVideo !== undefined) {
    next.General.UseVideo = overrides.useVideo;
  }
  if (overrides.audience) {
    next.General.Audience = overrides.audience;
  }
  if (overrides.language) {
    next.General.Language = overrides.language as ProjectConfig['General']['Language'];
  }
  if (overrides.duration !== undefined) {
    next.General.Duration = overrides.duration;
  }
  if (overrides.aspectRatio) {
    next.General.AspectRatio = overrides.aspectRatio as ProjectConfig['General']['AspectRatio'];
  }
  if (overrides.size) {
    next.General.Size = overrides.size as ProjectConfig['General']['Size'];
  }
  return parseProjectConfig(next);
}

export function deriveBlueprintAndInputs(
  config: ProjectConfig,
): {
  blueprint: BlueprintExpansionConfig;
  inputValues: InputValues;
  segmentCount: number;
} {
  const duration = config.General.Duration ?? 60;
  const segmentCount = Math.max(1, Math.round(duration / 10));
  const imagesPerSegment = config.Image.ImagesPerSegment ?? 1;

  const overrides = config.Video.ImageToVideo ?? {};
  const isImageToVideo = Array.from({ length: segmentCount }, (_, index) => {
    const key = `Segment_${index + 1}`;
    return overrides[key] ?? config.Video.IsImageToVideo ?? false;
  });

  const blueprint: BlueprintExpansionConfig = {
    segmentCount,
    imagesPerSegment,
    useVideo: config.General.UseVideo ?? false,
    isImageToVideo,
  };

  const inputs: InputValues = {
    UseVideo: config.General.UseVideo,
    Audience: config.General.Audience,
    Language: config.General.Language,
    Duration: config.General.Duration,
    AspectRatio: config.General.AspectRatio,
    Size: config.General.Size,
    ImageStyle:
      config.General.Style === 'Custom'
        ? config.General.CustomStyle || config.General.Style
        : config.General.Style,
    ImagesPerSegment: config.Image.ImagesPerSegment,
    VoiceId: config.Audio.Voice,
    Emotion: config.Audio.Emotion,
    MusicPromptInput: config.Music.Prompt,
    IsImageToVideo: config.Video.IsImageToVideo,
    SegmentAnimations: config.Video.SegmentAnimations,
    AssemblyStrategy: config.Video.AssemblyStrategy,
  };

  return { blueprint, inputValues: inputs, segmentCount };
}

export function parseProjectConfigOverrides(raw: unknown): Partial<ProjectConfig> {
  if (!raw || typeof raw !== 'object') {
    return {};
  }
  return raw as Partial<ProjectConfig>;
}

function deepMerge(target: any, source: any): void {
  if (!source || typeof source !== 'object') {
    return;
  }
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object') {
        target[key] = {};
      }
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
}

function clone<T>(value: T): T {
  const maybeClone = (globalThis as Record<string, unknown>).structuredClone as unknown;
  if (typeof maybeClone === 'function') {
    return (maybeClone as CloneFn)(value) as T;
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
