import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { createProducerHandlerFactory } from '../../sdk/handler-factory.js';
import { createProviderError } from '../../sdk/errors.js';
import type { HandlerFactory } from '../../types.js';
import { renderDocumentaryMp4 } from 'tutopanda-compositions';
import type { TimelineDocument } from 'tutopanda-compositions';
import type { ResolvedInputsAccessor } from '../../sdk/types.js';
import { createStorageContext, type StorageContext } from 'tutopanda-core';

interface Mp4ExporterConfig {
  rootFolder?: string;
  width?: number;
  height?: number;
  fps?: number;
}

interface ManifestPointer {
  revision: string | null;
  manifestPath: string | null;
}

interface ManifestFile {
  artefacts?: Record<
    string,
    {
      inline?: string;
      blob?: {
        hash: string;
        size: number;
        mimeType?: string;
      };
    }
  >;
}

const TIMELINE_ARTEFACT_ID = 'Artifact:TimelineComposer.Timeline';

export function createMp4ExporterHandler(): HandlerFactory {
  return createProducerHandlerFactory({
    domain: 'media',
    configValidator: parseExporterConfig,
    invoke: async ({ request, runtime }) => {
      const config = runtime.config.parse<Mp4ExporterConfig>(parseExporterConfig);
      const produceId = request.produces[0];
      if (!produceId) {
        throw createProviderError('MP4 exporter requires at least one declared artefact output.', {
          code: 'invalid_config',
          kind: 'user_input',
          causedByUser: true,
        });
      }

      const movieId = resolveMovieId(runtime.inputs);
      const { storageRoot, storageBasePath } = resolveStoragePaths(config, runtime.inputs);
      const { timeline, manifest, storage } = await loadTimeline(storageRoot, storageBasePath, movieId);
      const assetIds = collectAssetIds(timeline);
      const assets = await buildAssetMap({
        manifest,
        storage,
        storageRoot,
        movieId,
        assetIds,
      });

      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'tutopanda-mp4-exporter-'));
      const outputPath = path.join(tempDir, 'output.mp4');

      try {
        const renderedPath = await renderDocumentaryMp4({
          timeline,
          assets,
          outputFile: outputPath,
          width: config.width,
          height: config.height,
          fps: config.fps,
          browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE ?? process.env.CHROME_PATH,
        });
        const finalPath = renderedPath ?? outputPath;
        const buffer = await readFile(finalPath);

        return {
          status: 'succeeded',
          artefacts: [
            {
              artefactId: runtime.artefacts.expectBlob(produceId),
              status: 'succeeded',
              blob: {
                data: buffer,
                mimeType: 'video/mp4',
              },
            },
          ],
        };
      } finally {
        await rm(tempDir, { recursive: true, force: true });
      }
    },
  });
}

function parseExporterConfig(raw: unknown): Mp4ExporterConfig {
  if (!raw || typeof raw !== 'object') {
    throw createProviderError('MP4 exporter config must be an object.', {
      code: 'invalid_config',
      kind: 'user_input',
      causedByUser: true,
    });
  }
  const config = raw as Record<string, unknown>;
  const rootFolder = typeof config.rootFolder === 'string' ? config.rootFolder : undefined;
  const width = typeof config.width === 'number' ? config.width : undefined;
  const height = typeof config.height === 'number' ? config.height : undefined;
  const fps = typeof config.fps === 'number' ? config.fps : undefined;
  return { rootFolder, width, height, fps };
}

function resolveMovieId(inputs: ResolvedInputsAccessor): string {
  const canonical = inputs.getByNodeId<string>('Input:MovieId');
  if (typeof canonical === 'string' && canonical.trim()) {
    return canonical;
  }
  const direct = inputs.get<string>('MovieId');
  if (typeof direct === 'string' && direct.trim()) {
    return direct;
  }
  throw createProviderError('MP4 exporter is missing movieId (config or resolved input).', {
    code: 'invalid_config',
    kind: 'user_input',
    causedByUser: true,
  });
}

function resolveStoragePaths(config: Mp4ExporterConfig, inputs: ResolvedInputsAccessor): { storageRoot: string; storageBasePath: string } {
  const root = config.rootFolder ?? inputs.get<string>('StorageRoot');
  const basePath = inputs.get<string>('StorageBasePath');
  if (!root || typeof root !== 'string') {
    throw createProviderError('MP4 exporter is missing storage root (StorageRoot).', {
      code: 'invalid_config',
      kind: 'user_input',
      causedByUser: true,
    });
  }
  const base = typeof basePath === 'string' && basePath.trim() ? basePath : 'builds';
  return { storageRoot: root, storageBasePath: base };
}

async function loadTimeline(
  storageRoot: string,
  storageBasePath: string,
  movieId: string,
): Promise<{ timeline: TimelineDocument; manifest: ManifestFile; storage: StorageContext }> {
  const storage = createStorageContext({ kind: 'local', rootDir: storageRoot, basePath: storageBasePath });
  const pointerPath = storage.resolve(movieId, 'current.json');
  const pointerRaw = await storage.storage.readToString(pointerPath);
  const pointer = JSON.parse(pointerRaw) as ManifestPointer;
  if (!pointer.manifestPath) {
    throw createProviderError(`Manifest pointer missing path for movie ${movieId}.`, {
      code: 'missing_manifest',
      kind: 'user_input',
      causedByUser: true,
    });
  }

  const manifestPath = storage.resolve(movieId, pointer.manifestPath);
  const manifestRaw = await storage.storage.readToString(manifestPath);
  const manifest = JSON.parse(manifestRaw) as ManifestFile;
  const timeline = await readTimelineFromManifest(manifest, storage, movieId);
  return { timeline, manifest, storage };
}

async function readTimelineFromManifest(
  manifest: ManifestFile,
  storage: StorageContext,
  movieId: string,
): Promise<TimelineDocument> {
  const artefact = manifest.artefacts?.[TIMELINE_ARTEFACT_ID];
  if (!artefact) {
    throw createProviderError(`Timeline artefact not found for movie ${movieId}.`, {
      code: 'missing_timeline',
      kind: 'user_input',
      causedByUser: true,
    });
  }

  if (artefact.inline) {
    return JSON.parse(artefact.inline) as TimelineDocument;
  }

  if (artefact.blob?.hash) {
    const timelinePath = await resolveExistingBlobPath(storage, movieId, artefact.blob.hash, artefact.blob.mimeType);
    const contents = await storage.storage.readToString(timelinePath);
    return JSON.parse(contents) as TimelineDocument;
  }

  throw createProviderError('Timeline artefact missing payload.', {
    code: 'missing_timeline_payload',
    kind: 'user_input',
    causedByUser: true,
  });
}

function collectAssetIds(timeline: TimelineDocument): string[] {
  const ids = new Set<string>();
  for (const track of timeline.tracks ?? []) {
    for (const clip of track.clips ?? []) {
      const props = (clip as { properties?: Record<string, unknown> }).properties;
      const assetId = props?.assetId;
      if (typeof assetId === 'string' && assetId.length > 0) {
        ids.add(assetId);
      }
      const effects = props?.effects;
      if (Array.isArray(effects)) {
        for (const effect of effects) {
          const effectAsset = (effect as { assetId?: string }).assetId;
          if (typeof effectAsset === 'string' && effectAsset.length > 0) {
            ids.add(effectAsset);
          }
        }
      }
    }
  }
  return Array.from(ids);
}

async function buildAssetMap(args: {
  manifest: ManifestFile;
  storage: StorageContext;
  storageRoot: string;
  movieId: string;
  assetIds: string[];
}): Promise<Record<string, string>> {
  const { manifest, storage, storageRoot, movieId, assetIds } = args;
  const assets: Record<string, string> = {};
  for (const assetId of assetIds) {
    const artefact = manifest.artefacts?.[assetId];
    if (!artefact || !artefact.blob?.hash) {
      throw createProviderError(`Asset ${assetId} is missing or does not contain a blob.`, {
        code: 'missing_asset',
        kind: 'user_input',
        causedByUser: true,
      });
    }
    const relativePath = await resolveExistingBlobPath(storage, movieId, artefact.blob.hash, artefact.blob.mimeType);
    const absolutePath = path.resolve(storageRoot, relativePath);
    assets[assetId] = pathToFileURL(absolutePath).toString();
  }
  return assets;
}

async function resolveExistingBlobPath(
  storage: StorageContext,
  movieId: string,
  hash: string,
  mimeType?: string,
): Promise<string> {
  const prefix = hash.slice(0, 2);
  const fileName = formatBlobFileName(hash, mimeType);
  const primary = storage.resolve(movieId, 'blobs', prefix, fileName);
  if (await storage.storage.fileExists(primary)) {
    return primary;
  }

  const legacy = storage.resolve(movieId, 'blobs', prefix, hash);
  if (!(await storage.storage.fileExists(legacy))) {
    throw createProviderError(`Blob not found for hash ${hash}.`, {
      code: 'missing_blob',
      kind: 'user_input',
      causedByUser: true,
    });
  }
  return legacy;
}

function formatBlobFileName(hash: string, mimeType?: string): string {
  const safeHash = hash.replace(/[^a-f0-9]/gi, '');
  const extension = inferExtension(mimeType);
  if (!extension) {
    return safeHash;
  }
  return safeHash.endsWith(`.${extension}`) ? safeHash : `${safeHash}.${extension}`;
}

function inferExtension(mimeType?: string): string | null {
  if (!mimeType) {
    return null;
  }
  const normalized = mimeType.toLowerCase();
  const known: Record<string, string> = {
    'audio/mpeg': 'mp3',
    'audio/mp3': 'mp3',
    'audio/wav': 'wav',
    'audio/x-wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg',
    'audio/flac': 'flac',
    'audio/aac': 'aac',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/webp': 'webp',
    'application/json': 'json',
    'text/plain': 'txt',
  };
  if (known[normalized]) {
    return known[normalized];
  }
  if (normalized.startsWith('audio/')) {
    return normalized.slice('audio/'.length);
  }
  if (normalized.startsWith('video/')) {
    return normalized.slice('video/'.length);
  }
  if (normalized.startsWith('image/')) {
    return normalized.slice('image/'.length);
  }
  if (normalized === 'application/octet-stream') {
    return null;
  }
  return null;
}

// Export internals for targeted tests.
export const __test__ = {
  parseExporterConfig,
  resolveMovieId,
  resolveStoragePaths,
  collectAssetIds,
  formatBlobFileName,
};
