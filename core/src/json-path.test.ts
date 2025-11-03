import { describe, expect, it } from 'vitest';
import { readJsonPath } from './json-path.js';

describe('readJsonPath', () => {
  const sample = {
    movie: {
      title: 'Test Movie',
      segments: [
        { id: 'seg-1', text: 'Intro' },
        { id: 'seg-2', text: 'Main' },
      ],
      meta: {
        nested: {
          value: 42,
        },
      },
    },
  };

  it('resolves dot paths', () => {
    const result = readJsonPath(sample, 'movie.title');
    expect(result.exists).toBe(true);
    expect(result.value).toBe('Test Movie');
  });

  it('resolves array indices', () => {
    const result = readJsonPath(sample, 'movie.segments[1].text');
    expect(result.exists).toBe(true);
    expect(result.value).toBe('Main');
  });

  it('returns missing when traversing absent property', () => {
    const result = readJsonPath(sample, 'movie.summary');
    expect(result.exists).toBe(false);
    expect(result.value).toBeUndefined();
  });

  it('returns missing for out-of-bounds index', () => {
    const result = readJsonPath(sample, 'movie.segments[3]');
    expect(result.exists).toBe(false);
  });

  it('throws on malformed paths', () => {
    expect(() => readJsonPath(sample, 'movie.segments[')).toThrowError();
    expect(() => readJsonPath(sample, 'movie.segments[foo]')).toThrowError();
  });
});
