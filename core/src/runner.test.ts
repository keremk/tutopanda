import { describe, expect, it, vi } from 'vitest';
import { createRunner } from './runner.js';
import type { ExecutionPlan, Manifest, ProduceRequest, ProduceResult } from './types.js';

const baseManifest: Manifest = {
  revision: 'rev-0000',
  baseRevision: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  inputs: {},
  artefacts: {},
  timeline: {},
};

const basePlan: ExecutionPlan = {
  revision: 'rev-0001',
  manifestBaseHash: 'hash-0000',
  layers: [
    [
      {
        jobId: 'job-1',
        producer: 'ScriptProducer',
        inputs: [],
      },
    ],
    [
      {
        jobId: 'job-2',
        producer: 'AudioProducer',
        inputs: ['Artifact:NarrationScript'],
      },
    ],
  ],
  createdAt: '2024-01-02T00:00:00.000Z',
};

describe('createRunner', () => {
  it('executes layers sequentially with provided produce function', async () => {
    const produce = vi.fn(async (request: ProduceRequest): Promise<ProduceResult> => ({
      jobId: request.job.jobId,
      status: 'succeeded',
      artefacts: [],
    }));

    const runner = createRunner();
    const result = await runner.execute(basePlan, {
      movieId: 'movie-123',
      manifest: baseManifest,
      produce,
    });

    expect(produce).toHaveBeenCalledTimes(2);
    expect(produce.mock.calls[0][0].job.jobId).toBe('job-1');
    expect(produce.mock.calls[1][0].job.jobId).toBe('job-2');

    expect(result.status).toBe('succeeded');
    expect(result.jobs).toHaveLength(2);
    expect(result.jobs[0].layerIndex).toBe(0);
    expect(result.jobs[1].layerIndex).toBe(1);
    expect(await result.buildManifest()).toBe(baseManifest);
  });

  it('uses stub produce when none supplied', async () => {
    const runner = createRunner();
    const result = await runner.execute(basePlan, {
      movieId: 'movie-456',
      manifest: baseManifest,
    });

    expect(result.status).toBe('succeeded');
    expect(result.jobs.every((job) => job.status === 'skipped')).toBe(true);
  });

  it('marks run as failed when a job throws', async () => {
    const produce = vi.fn(async (request: ProduceRequest): Promise<ProduceResult> => {
      if (request.job.jobId === 'job-2') {
        throw new Error('boom');
      }
      return {
        jobId: request.job.jobId,
        status: 'succeeded',
        artefacts: [],
      };
    });

    const runner = createRunner();
    const result = await runner.execute(basePlan, {
      movieId: 'movie-error',
      manifest: baseManifest,
      produce,
    });

    expect(result.status).toBe('failed');
    expect(result.jobs).toHaveLength(2);
    const failedJob = result.jobs.find((job) => job.jobId === 'job-2');
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.error?.message).toContain('boom');
  });
});
