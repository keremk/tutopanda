import { describe, expect, it } from 'vitest';
import { createEventLog, hashInputPayload } from './event-log.js';
import {
  createManifestService,
  ManifestConflictError,
  ManifestNotFoundError,
} from './manifest.js';
import { createStorageContext, initializeMovieStorage } from './storage.js';
import type {
  ArtefactEvent,
  Clock,
  Manifest,
  ManifestArtefactEntry,
  ManifestInputEntry,
} from './types.js';
import { hashPayload } from './hashing.js';

function memoryContext() {
  return createStorageContext({ kind: 'memory', basePath: 'builds' });
}

const clock: Clock = {
  now: () => new Date('2025-01-01T00:00:00Z').toISOString(),
};

describe('ManifestService', () => {
  it('saves and loads current manifest with hash pointer', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const manifestSvc = createManifestService(ctx);

    const manifest: Manifest = {
      revision: 'rev-0001',
      baseRevision: null,
      createdAt: clock.now(),
      inputs: {
        inquiry_prompt: exampleInputEntry(),
      },
      artefacts: {
        segment_script_0: exampleArtefactEntry(),
      },
      timeline: {},
    };

    const { hash } = await manifestSvc.saveManifest(manifest, {
      movieId: 'demo',
      previousHash: null,
      clock,
    });

    const { manifest: loaded, hash: loadedHash } = await manifestSvc.loadCurrent('demo');
    expect(loaded).toEqual(manifest);
    expect(loadedHash).toBe(hash);

    const pointer = JSON.parse(await ctx.storage.readToString('builds/demo/current.json'));
    expect(pointer).toMatchObject({
      revision: 'rev-0001',
      manifestPath: 'manifests/rev-0001.json',
      hash,
    });
  });

  it('throws conflict when previous hash mismatches pointer', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const manifestSvc = createManifestService(ctx);

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

    await expect(
      manifestSvc.saveManifest(
        { ...manifest, revision: 'rev-0002' },
        {
          movieId: 'demo',
          previousHash: 'mismatch',
          clock,
        },
      ),
    ).rejects.toBeInstanceOf(ManifestConflictError);
  });

  it('builds manifest snapshot from event log', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const manifestSvc = createManifestService(ctx);
    const eventLog = createEventLog(ctx);

    await eventLog.appendInput('demo', {
      id: 'inquiry_prompt',
      revision: 'rev-0001',
      hash: hashInputPayload({ prompt: 'first' }),
      payload: { prompt: 'first' },
      editedBy: 'user',
      createdAt: new Date('2024-12-30T00:00:00Z').toISOString(),
    });
    await eventLog.appendInput('demo', {
      id: 'inquiry_prompt',
      revision: 'rev-0002',
      hash: hashInputPayload({ prompt: 'second' }),
      payload: { prompt: 'second' },
      editedBy: 'user',
      createdAt: new Date('2024-12-31T00:00:00Z').toISOString(),
    });

    const artefactEvent: ArtefactEvent = {
      artefactId: 'segment_script_0',
      revision: 'rev-0002',
      inputsHash: 'inputs:hash',
      output: { inline: 'Script v2' },
      status: 'succeeded',
      producedBy: 'script_producer',
      createdAt: new Date('2024-12-31T01:00:00Z').toISOString(),
    };
    await eventLog.appendArtefact('demo', artefactEvent);
    await eventLog.appendArtefact('demo', {
      ...artefactEvent,
      revision: 'rev-0003',
      status: 'failed',
      createdAt: new Date('2024-12-31T02:00:00Z').toISOString(),
    });

    const manifest = await manifestSvc.buildFromEvents({
      movieId: 'demo',
      targetRevision: 'rev-0003',
      baseRevision: 'rev-0002',
      eventLog,
      clock,
    });

    expect(manifest.inputs.inquiry_prompt.hash).toBe(hashInputPayload({ prompt: 'second' }));
    expect(manifest.inputs.inquiry_prompt.payloadDigest).toBe(
      hashPayload({ prompt: 'second' }).canonical,
    );
    expect(Object.keys(manifest.artefacts)).toEqual(['segment_script_0']);
    expect(manifest.revision).toBe('rev-0003');
    expect(manifest.baseRevision).toBe('rev-0002');
    expect(manifest.createdAt).toBe(clock.now());
  });

  it('errors when loading manifest without pointer', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo', { seedCurrentJson: false });
    const manifestSvc = createManifestService(ctx);
    await expect(manifestSvc.loadCurrent('demo')).rejects.toBeInstanceOf(ManifestNotFoundError);
  });
});

function exampleInputEntry(): ManifestInputEntry {
  const payload = { prompt: 'hello world' };
  const fingerprint = hashPayload(payload);
  return {
    hash: fingerprint.hash,
    payloadDigest: fingerprint.canonical,
    createdAt: clock.now(),
  };
}

function exampleArtefactEntry(): ManifestArtefactEntry {
  return {
    hash: 'sha-output',
    inline: 'script contents',
    producedBy: 'script_producer',
    status: 'succeeded',
    createdAt: clock.now(),
  };
}
