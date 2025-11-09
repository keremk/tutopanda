import { describe, expect, it } from 'vitest';
import { createDefaultProjectConfig, parseProjectConfig, parseProjectConfigPartial } from './config.js';

describe('ProjectConfigSchema', () => {
  it('provides defaults when fields are omitted', () => {
    const config = createDefaultProjectConfig();
    expect(config.duration).toBe(60);
    expect(config.voice).toBe('Atlas');
    expect(config.style).toBe('Ghibli');
  });

  it('parses provided values and keeps unknown fields optional', () => {
    const config = parseProjectConfig({
      duration: 90,
      style: 'Pixar',
      voice: 'Morgan',
    });

    expect(config.duration).toBe(90);
    expect(config.style).toBe('Pixar');
    expect(config.voice).toBe('Morgan');
  });

  it('parses partial overrides without applying defaults', () => {
    const override = parseProjectConfigPartial({
      audience: 'students',
    });
    expect(override.audience).toBe('students');
    expect(override.duration).toBeUndefined();
  });
});
