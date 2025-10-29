import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createManifestService,
  type Clock,
  type Manifest,
} from 'tutopanda-core';
import { createStorageContext, initializeMovieStorage } from 'tutopanda-core';
import { runManifestShow } from './manifest-show.js';

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

const clock: Clock = {
  now: () => new Date('2025-01-01T00:00:00Z').toISOString(),
};

describe('runManifestShow', () => {
  it('returns current manifest when present', async () => {
    const root = await createTempRoot();
    const storage = createStorageContext({ kind: 'local', rootDir: root, basePath: 'builds' });
    await initializeMovieStorage(storage, 'demo');
    const manifestSvc = createManifestService(storage);
    const manifest: Manifest = {
      revision: 'rev-0001',
      baseRevision: null,
      createdAt: clock.now(),
      inputs: {},
      artefacts: {},
      timeline: {},
    };

    await manifestSvc.saveManifest(manifest, {
      movieId: 'demo',
      previousHash: null,
      clock,
    });

    const result = await runManifestShow({
      movieId: 'demo',
      rootDir: root,
      basePath: 'builds',
    });

    expect(result.status).toBe('ok');
    expect(result.manifest).toEqual(manifest);
    expect(result.hash).toBeTruthy();
  });

  it('returns not-found when manifest is absent', async () => {
    const root = await createTempRoot();
    await initializeMovieStorage(createStorageContext({ kind: 'local', rootDir: root, basePath: 'builds' }), 'demo');

    const result = await runManifestShow({
      movieId: 'demo',
      rootDir: root,
      basePath: 'builds',
    });

    expect(result.status).toBe('not-found');
    expect(result.manifest).toBeNull();
    expect(result.hash).toBeNull();
  });
});
