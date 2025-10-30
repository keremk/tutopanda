import { describe, expect, it } from 'vitest';
import { createDefaultProjectConfig, parseProjectConfig } from './config.js';

describe('ProjectConfigSchema', () => {
  it('provides defaults when fields are omitted', () => {
    const config = createDefaultProjectConfig();
    expect(config.General.UseVideo).toBe(false);
    expect(config.General.Duration).toBe(60);
    expect(config.Image.ImagesPerSegment).toBe(2);
    expect(config.Video.IsImageToVideo).toBe(false);
  });

  it('parses provided values and keeps unknown fields optional', () => {
    const config = parseProjectConfig({
      General: {
        UseVideo: true,
        Duration: 90,
        Style: 'Pixar',
      },
      Image: {
        ImagesPerSegment: 3,
      },
      Video: {
        IsImageToVideo: true,
        ImageToVideo: {
          Segment_1: false,
        },
      },
    });

    expect(config.General.UseVideo).toBe(true);
    expect(config.General.Duration).toBe(90);
    expect(config.General.Style).toBe('Pixar');
    expect(config.Image.ImagesPerSegment).toBe(3);
    expect(config.Video.IsImageToVideo).toBe(true);
    expect(config.Video.ImageToVideo.Segment_1).toBe(false);
  });
});
