import { describe, expect, it } from 'vitest';
import { createDefaultProjectConfig, parseProjectConfig, parseProjectConfigPartial } from './config.js';

describe('ProjectConfigSchema', () => {
  it('provides defaults when fields are omitted', () => {
    const config = createDefaultProjectConfig();
    expect(config.useVideo).toBe(false);
    expect(config.duration).toBe(60);
    expect(config.voice).toBe('Atlas');
    expect(config.isImageToVideo).toBe(false);
    expect(config.imageToVideo).toEqual({});
  });

  it('parses provided values and keeps unknown fields optional', () => {
    const config = parseProjectConfig({
      useVideo: true,
      duration: 90,
      style: 'Pixar',
      voice: 'Morgan',
      isImageToVideo: true,
      imageToVideo: {
        Segment_1: false,
      },
    });

    expect(config.useVideo).toBe(true);
    expect(config.duration).toBe(90);
    expect(config.style).toBe('Pixar');
    expect(config.voice).toBe('Morgan');
    expect(config.isImageToVideo).toBe(true);
    expect(config.imageToVideo.Segment_1).toBe(false);
  });

  it('parses partial overrides without applying defaults', () => {
    const override = parseProjectConfigPartial({
      useVideo: true,
    });
    expect(override.useVideo).toBe(true);
    expect(override.duration).toBeUndefined();
  });
});
