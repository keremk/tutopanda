import { FileStorage } from '@flystorage/file-storage';
import { InMemoryStorageAdapter } from '@flystorage/in-memory';
import { LocalStorageAdapter } from '@flystorage/local-fs';
import { posix as path } from 'node:path';
import type { ExecutionPlan, RevisionId } from './types.js';

export type StorageConfig =
  | (BaseStorageConfig & {
      kind: 'local';
      /** Absolute path on the local filesystem that will house all movie builds. */
      rootDir: string;
    })
  | (BaseStorageConfig & {
      kind: 'memory';
    });

interface BaseStorageConfig {
  /** Optional prefix inside the storage adapter (defaults to "builds"). */
  basePath?: string;
}

export interface StorageContext {
  storage: FileStorage;
  basePath: string;
  /** Resolve a storage-relative path (POSIX separators). */
  resolve(movieId: string, ...segments: string[]): string;
}

const DEFAULT_BASE_PATH = 'builds';

export function createStorageContext(config: StorageConfig): StorageContext {
  const basePath = normalizeSegment(config.basePath ?? DEFAULT_BASE_PATH);
  const storage = new FileStorage(resolveAdapter(config));
  return {
    storage,
    basePath,
    resolve(movieId, ...segments) {
      const cleanMovieId = normalizeSegment(movieId);
      const cleanedSegments = segments.map(normalizeSegment).filter(Boolean);
      const allSegments = [basePath, cleanMovieId, ...cleanedSegments].filter(
        Boolean
      );
      return allSegments.length ? path.join(...allSegments) : '';
    },
  };
}

function resolveAdapter(config: StorageConfig) {
  switch (config.kind) {
    case 'local':
      return new LocalStorageAdapter(config.rootDir);
    case 'memory':
      return new InMemoryStorageAdapter();
    default: {
      const neverCase: never = config;
      throw new Error(
        `Unsupported storage config: ${JSON.stringify(neverCase)}`
      );
    }
  }
}

export interface InitializeMovieOptions {
  seedCurrentJson?: boolean;
}

export async function initializeMovieStorage(
  ctx: StorageContext,
  movieId: string,
  options: InitializeMovieOptions = {}
): Promise<void> {
  const storage = ctx.storage;
  const root = ctx.resolve(movieId);
  await ensureDirectoryChain(storage, ctx.basePath);
  await ensureDirectoryChain(storage, root);

  const manifestsDir = ctx.resolve(movieId, 'manifests');
  const eventsDir = ctx.resolve(movieId, 'events');
  const runsDir = ctx.resolve(movieId, 'runs');
  const blobsDir = ctx.resolve(movieId, 'blobs');

  await ensureDirectoryChain(storage, manifestsDir);
  await ensureDirectoryChain(storage, eventsDir);
  await ensureDirectoryChain(storage, runsDir);
  await ensureDirectoryChain(storage, blobsDir);

  await ensureFile(storage, path.join(eventsDir, 'inputs.log'), '');
  await ensureFile(storage, path.join(eventsDir, 'artefacts.log'), '');

  if (options.seedCurrentJson !== false) {
    await ensureFile(
      storage,
      path.join(root, 'current.json'),
      JSON.stringify({ revision: null }, null, 2)
    );
  }
}

export const planStore = {
  async save(
    plan: ExecutionPlan,
    ctx: { movieId: string; storage: StorageContext }
  ): Promise<void> {
    const fileName = `${plan.revision}-plan.json`;
    const runsDir = ctx.storage.resolve(ctx.movieId, 'runs');
    await ensureDirectoryChain(ctx.storage.storage, runsDir);
    const finalPath = path.join(runsDir, fileName);
    await writeJson(ctx.storage.storage, finalPath, plan);
  },

  async load(
    movieId: string,
    revision: RevisionId,
    ctx: StorageContext
  ): Promise<ExecutionPlan | null> {
    const planPath = ctx.resolve(movieId, 'runs', `${revision}-plan.json`);
    if (!(await ctx.storage.fileExists(planPath))) {
      return null;
    }
    const raw = await ctx.storage.readToString(planPath);
    return JSON.parse(raw) as ExecutionPlan;
  },
};

async function ensureDirectoryChain(
  storage: FileStorage,
  targetPath: string
): Promise<void> {
  if (!targetPath) {
    return;
  }
  const segments = targetPath.split('/').filter(Boolean);
  let current = '';
  for (const segment of segments) {
    current = current ? path.join(current, segment) : segment;
    if (!(await storage.directoryExists(current))) {
      await storage.createDirectory(current, {});
    }
  }
}

async function ensureFile(
  storage: FileStorage,
  targetPath: string,
  contents: string
): Promise<void> {
  if (await storage.fileExists(targetPath)) {
    return;
  }
  const mime = targetPath.endsWith('.json') ? 'application/json' : 'text/plain';
  await writeString(storage, targetPath, contents, mime);
}

async function writeJson(
  storage: FileStorage,
  targetPath: string,
  payload: unknown
): Promise<void> {
  const data = JSON.stringify(payload, null, 2);
  await writeString(storage, targetPath, data);
}

async function writeString(
  storage: FileStorage,
  targetPath: string,
  data: string,
  mimeType: string = 'application/json'
): Promise<void> {
  const tmpPath = `${targetPath}.tmp-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  await storage.write(tmpPath, data, { mimeType });
  await storage.moveFile(tmpPath, targetPath);
}

function normalizeSegment(segment: string): string {
  return segment.replace(/^\/+/, '').replace(/\/+$/, '');
}
