import {
  createEventLog,
  createManifestService,
  createStorageContext,
  initializeMovieStorage,
  type ArtefactEventStatus,
  type ExecutionPlan,
  type Manifest,
  type RunResult,
  type ProviderName,
  type Logger,
} from '@tutopanda/core';
import { createProviderRegistry, SchemaRegistry } from '@tutopanda/providers';
import { createProviderProduce, prepareProviderHandlers } from './build.js';
import { executePlanWithConcurrency } from './plan-runner.js';
import type { ProducerOptionsMap } from './producer-options.js';
import { normalizeConcurrency } from './cli-config.js';

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
  errorMessage?: string;
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
  providerOptions: ProducerOptionsMap;
  resolvedInputs: Record<string, unknown>;
  concurrency?: number;
  storage?: {
    rootDir: string;
    basePath: string;
  };
  logger?: Logger;
}

export async function executeDryRun(args: ExecuteDryRunArgs): Promise<DryRunSummary> {
  const logger = args.logger ?? globalThis.console;
  const concurrency = normalizeConcurrency(args.concurrency);
  const storage = args.storage
    ? createStorageContext({ kind: 'local', rootDir: args.storage.rootDir, basePath: args.storage.basePath })
    : createStorageContext({ kind: 'memory' });
  if (!args.storage) {
    await initializeMovieStorage(storage, args.movieId);
  }
  const eventLog = createEventLog(storage);
  const manifestService = createManifestService(storage);

  // Populate SchemaRegistry from provider options (blueprints)
  const schemaRegistry = new SchemaRegistry();
  /* eslint-disable no-unused-vars */
  for (const [_, options] of args.providerOptions) {
    for (const option of options) {
      if (option.sdkMapping) {
        schemaRegistry.register(option.provider as ProviderName, option.model, {
          sdkMapping: option.sdkMapping as any,
          config: option.config as any,
        });
      }
    }
  }

  const registry = createProviderRegistry({ mode: 'simulated', schemaRegistry, logger });
  const preResolved = prepareProviderHandlers(registry, args.plan, args.providerOptions);
  await registry.warmStart?.(preResolved);
  const resolvedInputsWithSystem = {
    ...args.resolvedInputs,
    ...(args.resolvedInputs['Input:MovieId'] === undefined ? { 'Input:MovieId': args.movieId } : {}),
    ...(args.storage?.rootDir && args.resolvedInputs['Input:StorageRoot'] === undefined
      ? { 'Input:StorageRoot': args.storage.rootDir }
      : {}),
    ...(args.storage?.basePath && args.resolvedInputs['Input:StorageBasePath'] === undefined
      ? { 'Input:StorageBasePath': args.storage.basePath }
      : {}),
  };
  const produce = createProviderProduce(
    registry,
    args.providerOptions,
    resolvedInputsWithSystem,
    preResolved,
    logger,
  );

  const runResult = await executePlanWithConcurrency(
    args.plan,
    {
      movieId: args.movieId,
      manifest: args.manifest,
      storage,
      eventLog,
      manifestService,
      produce,
      logger,
    },
    { concurrency },
  );
  return summarizeRun(runResult, args.plan);
}

function summarizeRun(runResult: RunResult, plan: ExecutionPlan): DryRunSummary {
  const jobs = runResult.jobs.map<DryRunJobSummary>((job) => ({
    jobId: job.jobId,
    producer: job.producer,
    status: job.status,
    layerIndex: job.layerIndex,
    errorMessage: job.error?.message,
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
