import { resolve as resolvePath } from 'node:path';
import {
  createEventLog,
  createManifestService,
  createRunner,
  createStorageContext,
  initializeMovieStorage,
  type ExecutionPlan,
  type Manifest,
  type ProduceFn,
  type ProduceResult,
  type ProducerKind,
  type RunResult,
} from 'tutopanda-core';
import { createProviderRegistry, producerCatalog } from 'tutopanda-providers';
import type { CliConfig } from './cli-config.js';

export interface ExecuteBuildOptions {
  cliConfig: CliConfig;
  movieId: string;
  plan: ExecutionPlan;
  manifest: Manifest;
  manifestHash: string | null;
}

export interface BuildSummary {
  status: RunResult['status'];
  jobCount: number;
  counts: {
    succeeded: number;
    failed: number;
    skipped: number;
  };
  manifestRevision: string;
  manifestPath: string;
}

export interface ExecuteBuildResult {
  run: RunResult;
  manifest: Manifest;
  manifestPath: string;
  manifestHash: string;
  summary: BuildSummary;
}

const knownProducerKinds = new Set<ProducerKind>(Object.keys(producerCatalog) as ProducerKind[]);

export async function executeBuild(options: ExecuteBuildOptions): Promise<ExecuteBuildResult> {
  const storage = createStorageContext({
    kind: 'local',
    rootDir: options.cliConfig.storage.root,
    basePath: options.cliConfig.storage.basePath,
  });

  await initializeMovieStorage(storage, options.movieId);

  const eventLog = createEventLog(storage);
  const manifestService = createManifestService(storage);
  const registry = createProviderRegistry({ mode: 'mock' });
  const produce = createProviderProduce(registry);
  const runner = createRunner();

  const run = await runner.execute(options.plan, {
    movieId: options.movieId,
    manifest: options.manifest,
    storage,
    eventLog,
    manifestService,
    produce,
  });

  const manifest = await run.buildManifest();
  const { hash } = await manifestService.saveManifest(manifest, {
    movieId: options.movieId,
    previousHash: options.manifestHash,
    clock: { now: () => new Date().toISOString() },
  });

  const relativeManifestPath = storage.resolve(
    options.movieId,
    'manifests',
    `${manifest.revision}.json`,
  );
  const manifestPath = resolvePath(options.cliConfig.storage.root, relativeManifestPath);

  return {
    run,
    manifest,
    manifestPath,
    manifestHash: hash,
    summary: summarizeRun(run, manifestPath),
  };
}

function summarizeRun(run: RunResult, manifestPath: string): BuildSummary {
  const counts = {
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  for (const job of run.jobs) {
    if (job.status === 'failed') {
      counts.failed += 1;
    } else if (job.status === 'skipped') {
      counts.skipped += 1;
    } else {
      counts.succeeded += 1;
    }
  }

  return {
    status: run.status,
    jobCount: run.jobs.length,
    counts,
    manifestRevision: run.revision,
    manifestPath,
  };
}

export function createProviderProduce(
  registry: ReturnType<typeof createProviderRegistry>,
): ProduceFn {
  return async (request) => {
    const producerName = request.job.producer;
    if (typeof producerName !== 'string' || !knownProducerKinds.has(producerName as ProducerKind)) {
      return {
        jobId: request.job.jobId,
        status: 'skipped',
        artefacts: [],
      };
    }

    const handler = registry.resolve({
      kind: producerName as ProducerKind,
      provider: request.job.provider,
      model: request.job.providerModel,
    });

    const response = await handler.invoke({
      jobId: request.job.jobId,
      producer: producerName as ProducerKind,
      provider: request.job.provider,
      model: request.job.providerModel,
      revision: request.revision,
      layerIndex: request.layerIndex,
      attempt: request.attempt,
      inputs: request.job.inputs,
      produces: request.job.produces,
      context: request.job.context ?? {},
    });

    return {
      jobId: request.job.jobId,
      status: response.status ?? 'succeeded',
      artefacts: response.artefacts,
      diagnostics: response.diagnostics,
    } satisfies ProduceResult;
  };
}
