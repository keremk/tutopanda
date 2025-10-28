import { resolve } from 'node:path';
import { createStorageContext, initializeMovieStorage } from 'tutopanda-core';
import process from 'node:process';

export interface StorageInitOptions {
  movieId: string;
  rootDir?: string;
  basePath?: string;
}

export async function runStorageInit(options: StorageInitOptions): Promise<{ rootPath: string }> {
  const rootPath = resolve(options.rootDir ?? process.cwd());
  const storageContext = createStorageContext({
    kind: 'local',
    rootDir: rootPath,
    basePath: options.basePath,
  });
  await initializeMovieStorage(storageContext, options.movieId);
  return { rootPath };
}
