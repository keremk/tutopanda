import type { ProjectConfig } from 'tutopanda-core';
import { parseProjectConfig } from 'tutopanda-core';
import type { BlueprintExpansionConfig, InputValues } from 'tutopanda-core';

export function mergeProjectConfig(
  base: ProjectConfig,
  override: Partial<ProjectConfig>,
): ProjectConfig {
  return parseProjectConfig({
    ...base,
    ...override,
  });
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
  const next = { ...config };
  if (overrides.style) {
    next.style = overrides.style as ProjectConfig['style'];
    if (overrides.style !== 'Custom') {
      next.customStyle = '';
    }
  }
  if (overrides.useVideo !== undefined) {
    next.useVideo = overrides.useVideo;
  }
  if (overrides.audience) {
    next.audience = overrides.audience;
  }
  if (overrides.language) {
    next.language = overrides.language as ProjectConfig['language'];
  }
  if (overrides.duration !== undefined) {
    next.duration = overrides.duration;
  }
  if (overrides.aspectRatio) {
    next.aspectRatio = overrides.aspectRatio as ProjectConfig['aspectRatio'];
  }
  if (overrides.size) {
    next.size = overrides.size as ProjectConfig['size'];
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
  const duration = config.duration ?? 60;
  const segmentCount = Math.max(1, Math.round(duration / 10));

  const overrides = config.imageToVideo ?? {};
  const isImageToVideo = Array.from({ length: segmentCount }, (_, index) => {
    const key = `Segment_${index + 1}`;
    return overrides[key] ?? config.isImageToVideo ?? false;
  });

  const blueprint: BlueprintExpansionConfig = {
    segmentCount,
    imagesPerSegment: 2, // default, overridden by providers
    useVideo: config.useVideo ?? false,
    isImageToVideo,
  };

  const inputs: InputValues = {
    UseVideo: config.useVideo,
    Audience: config.audience,
    Language: config.language,
    Duration: config.duration,
    AspectRatio: config.aspectRatio,
    Size: config.size,
    ImageStyle: config.style === 'Custom' ? config.customStyle || config.style : config.style,
    ImagesPerSegment: 2,
    IsImageToVideo: config.isImageToVideo,
  };

  return { blueprint, inputValues: inputs, segmentCount };
}
