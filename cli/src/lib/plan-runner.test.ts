import { describe, expect, it } from 'vitest';
import {
  createEventLog,
  createManifestService,
  createStorageContext,
  initializeMovieStorage,
  type ExecutionPlan,
  type Manifest,
  type ProduceFn,
} from 'tutopanda-core';
import { executePlanWithConcurrency } from './plan-runner.js';

describe('executePlanWithConcurrency', () => {
  it('runs layer jobs in parallel up to the limit and keeps layers sequential', async () => {
    const movieId = 'movie-test';
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, movieId);
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    const manifest: Manifest = {
      revision: 'rev-0000',
      baseRevision: null,
      createdAt: new Date().toISOString(),
      inputs: {},
      artefacts: {},
    };

    const makeJob = (jobId: string) => ({
      jobId,
      producer: jobId,
      inputs: [],
      produces: [`Artifact:${jobId}`],
      provider: 'openai',
      providerModel: 'test-model',
      rateKey: 'openai:test-model',
    });

    const layerOne = ['job-1', 'job-2', 'job-3'].map(makeJob);
    const layerTwo = [makeJob('job-4')];
    const plan: ExecutionPlan = {
      revision: 'rev-0001',
      manifestBaseHash: 'hash',
      layers: [layerOne, layerTwo],
      createdAt: new Date().toISOString(),
    };

    const durations = new Map<string, number>([
      ['job-1', 30],
      ['job-2', 10],
      ['job-3', 20],
      ['job-4', 5],
    ]);

    let active = 0;
    let peak = 0;
    let completedLayerOne = 0;
    let layerTwoStartedAfter = 0;
    const starts: string[] = [];

    const produce: ProduceFn = async ({ job }) => {
      const duration = durations.get(job.jobId) ?? 0;
      starts.push(job.jobId);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, duration));
      active -= 1;
      if (layerOne.some((entry) => entry.jobId === job.jobId)) {
        completedLayerOne += 1;
      } else {
        layerTwoStartedAfter = completedLayerOne;
      }
      return { jobId: job.jobId, status: 'succeeded', artefacts: [] };
    };

    const result = await executePlanWithConcurrency(
      plan,
      {
        movieId,
        manifest,
        storage,
        eventLog,
        manifestService,
        produce,
      },
      { concurrency: 2 },
    );

    expect(peak).toBeLessThanOrEqual(2);
    expect(layerTwoStartedAfter).toBe(layerOne.length);
    expect(starts.slice(0, layerOne.length)).toEqual(layerOne.map((job) => job.jobId));
    expect(starts[layerOne.length]).toBe('job-4');
    expect(result.jobs).toHaveLength(4);
  });
});
