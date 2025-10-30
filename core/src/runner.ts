import {
  type ArtefactEventStatus,
  type Clock,
  type ExecutionPlan,
  type JobDescriptor,
  type JobResult,
  type Manifest,
  type ProduceFn,
  type ProduceRequest,
  type ProduceResult,
  type RunResult,
  type SerializedError,
  type RevisionId,
} from './types.js';

/* eslint-disable no-unused-vars */
export interface RunnerLogger {
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
  debug?(message: string, meta?: Record<string, unknown>): void;
}

export interface RunnerOptions {
  clock?: Clock;
  logger?: RunnerLogger;
  produce?: ProduceFn;
}

export interface RunnerExecutionContext {
  movieId: string;
  manifest: Manifest;
  produce?: ProduceFn;
  logger?: RunnerLogger;
  clock?: Clock;
}

interface RunnerJobContext extends RunnerExecutionContext {
  layerIndex: number;
  attempt: number;
  revision: RevisionId;
}

const defaultClock: Clock = {
  now: () => new Date().toISOString(),
};

const noopLogger: RunnerLogger = {};

export function createRunner(options: RunnerOptions = {}) {
  const baseClock = options.clock ?? defaultClock;
  const baseLogger = options.logger ?? noopLogger;
  const baseProduce = options.produce ?? createStubProduce();

  return {
    async execute(plan: ExecutionPlan, context: RunnerExecutionContext): Promise<RunResult> {
      const clock = context.clock ?? baseClock;
      const logger = context.logger ?? baseLogger;
      const produce = context.produce ?? baseProduce;

      const startedAt = nowIso(clock);
      const jobs: JobResult[] = [];
      const layers = plan.layers ?? [];

      for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        const layer = layers[layerIndex] ?? [];
        if (layer.length === 0) {
          continue;
        }

        logger.info?.('runner.layer.start', {
          movieId: context.movieId,
          revision: plan.revision,
          layerIndex,
          jobs: layer.length,
        });

        for (const job of layer) {
          const jobResult = await executeJob(job, {
            ...context,
            layerIndex,
            attempt: 1,
            revision: plan.revision,
            produce,
            logger,
            clock,
          });
          jobs.push(jobResult);
        }

        logger.info?.('runner.layer.end', {
          movieId: context.movieId,
          revision: plan.revision,
          layerIndex,
        });
      }

      const completedAt = nowIso(clock);
      const status: RunResult['status'] = jobs.some((job) => job.status === 'failed')
        ? 'failed'
        : 'succeeded';

      return {
        status,
        revision: plan.revision as RevisionId,
        manifestBaseHash: plan.manifestBaseHash,
        jobs,
        startedAt,
        completedAt,
        async buildManifest(): Promise<Manifest> {
          return context.manifest;
        },
      };
    },

    async executeJob(job: JobDescriptor, context: RunnerJobContext): Promise<JobResult> {
      return executeJob(job, {
        ...context,
        produce: context.produce ?? baseProduce,
        logger: context.logger ?? baseLogger,
        clock: context.clock ?? baseClock,
      });
    },
  };
}

function createStubProduce(): ProduceFn {
  return async (request: ProduceRequest): Promise<ProduceResult> => ({
    jobId: request.job.jobId,
    status: 'skipped',
    artefacts: [],
    diagnostics: {
      reason: 'stubbed',
    },
  });
}

async function executeJob(
  job: JobDescriptor,
  context: RunnerJobContext & { produce: ProduceFn; logger: RunnerLogger; clock: Clock },
): Promise<JobResult> {
  const { movieId, layerIndex, attempt, revision, produce, logger, clock } = context;
  const startedAt = nowIso(clock);

  try {
    const result = await produce({
      movieId,
      job,
      layerIndex,
      attempt,
      revision,
    });

    const completedAt = nowIso(clock);
    const status = normalizeStatus(result.status);

    logger.info?.('runner.job.completed', {
      movieId,
      revision,
      jobId: job.jobId,
      producer: job.producer,
      status,
      layerIndex,
      attempt,
    });

    return {
      jobId: job.jobId,
      producer: job.producer,
      status,
      artefacts: result.artefacts ?? [],
      diagnostics: result.diagnostics,
      layerIndex,
      attempt,
      startedAt,
      completedAt,
    };
  } catch (error) {
    const completedAt = nowIso(clock);
    const serialized = serializeError(error);

    logger.error?.('runner.job.failed', {
      movieId,
      revision,
      jobId: job.jobId,
      producer: job.producer,
      layerIndex,
      attempt,
      error: serialized,
    });

    return {
      jobId: job.jobId,
      producer: job.producer,
      status: 'failed',
      artefacts: [],
      layerIndex,
      attempt,
      startedAt,
      completedAt,
      error: serialized,
    };
  }
}

function nowIso(clock: Clock): string {
  return clock.now();
}

function normalizeStatus(status: ArtefactEventStatus | undefined): ArtefactEventStatus {
  if (status === 'succeeded' || status === 'failed' || status === 'skipped') {
    return status;
  }
  return 'succeeded';
}

function serializeError(error: unknown): SerializedError {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return {
    name: 'Error',
    message: typeof error === 'string' ? error : JSON.stringify(error),
  };
}
