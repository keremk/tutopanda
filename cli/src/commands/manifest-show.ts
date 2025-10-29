import { resolve } from 'node:path';
import process from 'node:process';
import {
  createManifestService,
  ManifestNotFoundError,
} from 'tutopanda-core';
import { createStorageContext } from 'tutopanda-core';
import type { Manifest } from 'tutopanda-core';

export interface ManifestShowOptions {
  movieId: string;
  rootDir?: string;
  basePath?: string;
}

export interface ManifestShowResult {
  rootPath: string;
  manifest: Manifest | null;
  hash: string | null;
  status: 'ok' | 'not-found';
}

export async function runManifestShow(options: ManifestShowOptions): Promise<ManifestShowResult> {
  const rootPath = resolve(options.rootDir ?? process.cwd());
  const storage = createStorageContext({
    kind: 'local',
    rootDir: rootPath,
    basePath: options.basePath,
  });
  const manifestSvc = createManifestService(storage);

  try {
    const { manifest, hash } = await manifestSvc.loadCurrent(options.movieId);
    return { rootPath, manifest, hash, status: 'ok' };
  } catch (error) {
    if (error instanceof ManifestNotFoundError) {
      return { rootPath, manifest: null, hash: null, status: 'not-found' };
    }
    throw error;
  }
}
