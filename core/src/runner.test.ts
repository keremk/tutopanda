import { describe, expect, it, vi } from 'vitest';
import { createRunner } from './runner.js';
import { createEventLog } from './event-log.js';
import { createManifestService } from './manifest.js';
import { createStorageContext, initializeMovieStorage } from './storage.js';
import type {
  ExecutionPlan,
  Manifest,
  ProduceRequest,
  ProduceResult,
} from './types.js';

const baseManifest: Manifest = {
  revision: 'rev-0000',
  baseRevision: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  inputs: {},
  artefacts: {},
};

const plan: ExecutionPlan = {
  revision: 'rev-0001',
  manifestBaseHash: 'hash-0000',
  layers: [
    [
      {
        jobId: 'job-1',
        producer: 'ScriptProducer',
        inputs: [],
        produces: ['Artifact:NarrationScript'],
        provider: 'openai',
        providerModel: 'openai/GPT-5',
        rateKey: 'llm:script',
      },
    ],
    [
      {
        jobId: 'job-2',
        producer: 'AudioProducer',
        inputs: ['Artifact:NarrationScript'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        provider: 'replicate',
        providerModel: 'elevenlabs/turbo-v2.5',
        rateKey: 'audio:elevenlabs-turbo',
      },
    ],
  ],
  createdAt: '2024-01-02T00:00:00.000Z',
};

describe('createRunner', () => {
  it('executes layers and persists artefacts', async () => {
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, 'movie-123');
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    const produce = vi.fn(async (request: ProduceRequest): Promise<ProduceResult> => {
      if (request.job.jobId === 'job-1') {
        return {
          jobId: request.job.jobId,
          status: 'succeeded',
          artefacts: [
            {
              artefactId: 'Artifact:NarrationScript',
              inline: 'Once upon a time',
            },
          ],
        };
      }
      return {
        jobId: request.job.jobId,
        status: 'succeeded',
        artefacts: [
          {
            artefactId: 'Artifact:SegmentAudio[segment=0]',
            blob: {
              data: new TextEncoder().encode('AUDIO_DATA'),
              mimeType: 'audio/wav',
            },
          },
        ],
      };
    });

    const runner = createRunner();
    const result = await runner.execute(plan, {
      movieId: 'movie-123',
      manifest: baseManifest,
      storage,
      eventLog,
      manifestService,
      produce,
    });

    expect(produce).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('succeeded');
    expect(result.jobs).toHaveLength(2);

    const manifest = await result.buildManifest();
    expect(manifest.revision).toBe('rev-0001');
    expect(Object.keys(manifest.artefacts)).toContain('Artifact:NarrationScript');
    expect(Object.keys(manifest.artefacts)).toContain('Artifact:SegmentAudio[segment=0]');
  });

  it('uses stub produce when none supplied', async () => {
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, 'movie-456');
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    const runner = createRunner();
    const result = await runner.execute(plan, {
      movieId: 'movie-456',
      manifest: baseManifest,
      storage,
      eventLog,
      manifestService,
    });

    expect(result.status).toBe('succeeded');
    expect(result.jobs.every((job) => job.status === 'skipped')).toBe(true);
  });

  it('marks run as failed when job throws', async () => {
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, 'movie-error');
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    const produce = vi.fn(async (request: ProduceRequest): Promise<ProduceResult> => {
      if (request.job.jobId === 'job-2') {
        throw new Error('boom');
      }
      return {
        jobId: request.job.jobId,
        status: 'succeeded',
        artefacts: [
          {
            artefactId: 'Artifact:NarrationScript',
            inline: 'Hello world',
          },
        ],
      };
    });

    const runner = createRunner();
    const result = await runner.execute(plan, {
      movieId: 'movie-error',
      manifest: baseManifest,
      storage,
      eventLog,
      manifestService,
      produce,
    });

    expect(result.status).toBe('failed');
    const failedJob = result.jobs.find((job) => job.jobId === 'job-2');
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.error?.message).toContain('boom');
  });
});
