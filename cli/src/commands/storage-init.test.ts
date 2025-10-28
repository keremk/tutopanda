import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runStorageInit } from './storage-init.js';

const tmpRoots: string[] = [];

afterEach(async () => {
  while (tmpRoots.length) {
    const dir = tmpRoots.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tutopanda-cli-'));
  tmpRoots.push(dir);
  return dir;
}

describe('runStorageInit', () => {
  it('creates storage layout for a movie', async () => {
    const root = await createTempRoot();
    await runStorageInit({ movieId: 'demo', rootDir: root, basePath: 'builds' });

    const expectedPaths = [
      'builds/demo',
      'builds/demo/manifests',
      'builds/demo/events',
      'builds/demo/runs',
      'builds/demo/blobs',
    ];

    for (const relative of expectedPaths) {
      const stats = await stat(join(root, relative));
      expect(stats.isDirectory()).toBe(true);
    }

    const current = await readFile(join(root, 'builds/demo/current.json'), 'utf8');
    expect(JSON.parse(current)).toEqual({ revision: null });
  });

  it('is idempotent when rerun', async () => {
    const root = await createTempRoot();
    await runStorageInit({ movieId: 'demo', rootDir: root, basePath: 'builds' });
    await runStorageInit({ movieId: 'demo', rootDir: root, basePath: 'builds' });

    const inputs = await readFile(join(root, 'builds/demo/events/inputs.log'), 'utf8');
    expect(inputs).toBe('');
  });
});
