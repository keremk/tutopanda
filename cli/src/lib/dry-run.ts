import {
  createEventLog,
  createManifestService,
  createRunner,
  createStorageContext,
  initializeMovieStorage,
  type ArtefactEventStatus,
  type ExecutionPlan,
  type Manifest,
  type RunResult,
} from 'tutopanda-core';
import { createProviderRegistry } from 'tutopanda-providers';
import { createProviderProduce, prepareProviderHandlers } from './build.js';
import type { ProviderOptionsMap } from './provider-settings.js';

export interface DryRunStatusCounts {
  succeeded: number;
  failed: number;
  skipped: number;
}

export interface DryRunJobSummary {
  jobId: string;
  producer: string;
  status: ArtefactEventStatus;
  layerIndex: number;
}

export interface DryRunSummary {
  status: RunResult['status'];
  layers: number;
  jobCount: number;
  statusCounts: DryRunStatusCounts;
  jobs: DryRunJobSummary[];
}

interface ExecuteDryRunArgs {
  movieId: string;
  plan: ExecutionPlan;
  manifest: Manifest;
  providerOptions: ProviderOptionsMap;
  storage?: {
    rootDir: string;
    basePath: string;
  };
}

export async function executeDryRun(args: ExecuteDryRunArgs): Promise<DryRunSummary> {
  const runner = createRunner();
  const storage = args.storage
    ? createStorageContext({ kind: 'local', rootDir: args.storage.rootDir, basePath: args.storage.basePath })
    : createStorageContext({ kind: 'memory' });
  if (!args.storage) {
    await initializeMovieStorage(storage, args.movieId);
  }
  const eventLog = createEventLog(storage);
  const manifestService = createManifestService(storage);
  const registry = createProviderRegistry({ mode: 'mock' });
  const preResolved = prepareProviderHandlers(registry, args.plan, args.providerOptions);
  await registry.warmStart?.(preResolved);
  const produce = createProviderProduce(registry, args.providerOptions, preResolved, console);

  const runResult = await runner.execute(args.plan, {
    movieId: args.movieId,
    manifest: args.manifest,
    storage,
    eventLog,
    manifestService,
    produce,
  });
  return summarizeRun(runResult, args.plan);
}

function summarizeRun(runResult: RunResult, plan: ExecutionPlan): DryRunSummary {
  const jobs = runResult.jobs.map<DryRunJobSummary>((job) => ({
    jobId: job.jobId,
    producer: job.producer,
    status: job.status,
    layerIndex: job.layerIndex,
  }));

  const counts: DryRunStatusCounts = {
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  for (const job of jobs) {
    if (job.status === 'succeeded') {
      counts.succeeded += 1;
    } else if (job.status === 'failed') {
      counts.failed += 1;
    } else {
      counts.skipped += 1;
    }
  }

  return {
    status: runResult.status,
    layers: plan.layers.length,
    jobCount: jobs.length,
    statusCounts: counts,
    jobs,
  };
}
