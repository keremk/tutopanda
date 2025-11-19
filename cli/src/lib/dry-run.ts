/* eslint-disable no-console */
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
  type ProviderName,
} from 'tutopanda-core';
import { createProviderRegistry, SchemaRegistry } from 'tutopanda-providers';
import { createProviderProduce, prepareProviderHandlers } from './build.js';
import type { ProducerOptionsMap } from './producer-options.js';

const console = globalThis.console;

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


  // Populate SchemaRegistry from provider options (blueprints)
  const schemaRegistry = new SchemaRegistry();
  for (const [_, options] of args.providerOptions) {
    for (const option of options) {
      if (option.config) {
        const config = option.config as Record<string, unknown>;
        // Check if sdkMapping exists in the config (it comes from the blueprint)
        if (config.sdkMapping) {
          schemaRegistry.register(option.provider as ProviderName, option.model, {
            sdkMapping: config.sdkMapping as any,
            config: config.config as any,
          });
        }
      }
    }
  }

  const registry = createProviderRegistry({ mode: 'simulated', schemaRegistry });
  const preResolved = prepareProviderHandlers(registry, args.plan, args.providerOptions);
  await registry.warmStart?.(preResolved);
  const produce = createProviderProduce(
    registry,
    args.providerOptions,
    args.resolvedInputs,
    preResolved,
    console,
  );

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
