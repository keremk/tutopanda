import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { resolveArtifactsFromEventLog } from './artifact-resolver.js';
import type { EventLog } from './event-log.js';
import { hashInputs } from './event-log.js';
import { createManifestService, type ManifestService } from './manifest.js';
import type { StorageContext } from './storage.js';
import {
  type ArtefactEvent,
  type ArtefactEventStatus,
  type BlobRef,
  type Clock,
  type ExecutionPlan,
  type JobDescriptor,
  type JobResult,
  type Manifest,
  type ProduceFn,
  type ProduceRequest,
  type ProduceResult,
  type ProducedArtefact,
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
  storage: StorageContext;
  eventLog: EventLog;
  manifestService?: ManifestService;
  produce?: ProduceFn;
  logger?: RunnerLogger;
  clock?: Clock;
}

type SingleJobExecutionContext = RunnerExecutionContext & {
  revision: RevisionId;
  layerIndex?: number;
  attempt?: number;
};

interface RunnerJobContext extends RunnerExecutionContext {
  layerIndex: number;
  attempt: number;
  revision: RevisionId;
  produce: ProduceFn;
  logger: RunnerLogger;
  clock: Clock;
  manifestService: ManifestService;
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
      const storage = context.storage;
      const eventLog = context.eventLog;

      const manifestService = context.manifestService ?? createManifestService(storage);

      const startedAt = clock.now();
      const jobs: JobResult[] = [];

      for (let layerIndex = 0; layerIndex < plan.layers.length; layerIndex += 1) {
        const layer = plan.layers[layerIndex] ?? [];
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
            manifestService,
          });
          jobs.push(jobResult);
        }

        logger.info?.('runner.layer.end', {
          movieId: context.movieId,
          revision: plan.revision,
          layerIndex,
        });
      }

      const completedAt = clock.now();
      const status: RunResult['status'] = jobs.some((job) => job.status === 'failed')
        ? 'failed'
        : 'succeeded';

      return {
        status,
        revision: plan.revision,
        manifestBaseHash: plan.manifestBaseHash,
        jobs,
        startedAt,
        completedAt,
        async buildManifest(): Promise<Manifest> {
          return manifestService.buildFromEvents({
            movieId: context.movieId,
            targetRevision: plan.revision,
            baseRevision: context.manifest.revision,
            eventLog,
            clock,
          });
        },
      };
    },

    async executeJob(job: JobDescriptor, ctx: SingleJobExecutionContext): Promise<JobResult> {
      const clock = ctx.clock ?? baseClock;
      const logger = ctx.logger ?? baseLogger;
      const produce = ctx.produce ?? baseProduce;
      const storage = ctx.storage;
      const eventLog = ctx.eventLog;
      const manifestService = ctx.manifestService ?? createManifestService(storage);

      return executeJob(job, {
        ...ctx,
        layerIndex: ctx.layerIndex ?? 0,
        attempt: ctx.attempt ?? 1,
        revision: ctx.revision,
        produce,
        logger,
        clock,
        manifestService,
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
  context: RunnerJobContext,
): Promise<JobResult> {
  const { movieId, layerIndex, attempt, revision, produce, logger, clock, storage, eventLog } = context;
  const startedAt = clock.now();
  const inputsHash = hashInputs(job.inputs);

  try {
    // Resolve artifacts from event log
    const resolvedArtifacts = await resolveArtifactsFromEventLog({
      artifactIds: job.inputs,
      eventLog,
      storage,
      movieId,
    });

    // Merge resolved artifacts into job context
    const enrichedJob = mergeResolvedArtifacts(job, resolvedArtifacts);

    const result = await produce({
      movieId,
      job: enrichedJob,
      layerIndex,
      attempt,
      revision,
    });

    const artefacts = await materializeArtefacts(result.artefacts, {
      movieId,
      job,
      revision,
      inputsHash,
      storage,
      eventLog,
      clock,
    });

    const completedAt = clock.now();
    const status = deriveJobStatus(normalizeStatus(result.status), artefacts);

    logger.info?.('runner.job.completed', {
      movieId,
      revision,
      jobId: job.jobId,
      producer: job.producer,
      status,
      layerIndex,
      attempt,
      artefacts: artefacts.length,
    });

    return {
      jobId: job.jobId,
      producer: job.producer,
      status,
      artefacts,
      diagnostics: result.diagnostics,
      layerIndex,
      attempt,
      startedAt,
      completedAt,
    };
  } catch (error) {
    const completedAt = clock.now();
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

async function materializeArtefacts(
  artefacts: ProducedArtefact[],
  context: {
    movieId: string;
    job: JobDescriptor;
    revision: RevisionId;
    inputsHash: string;
    storage: StorageContext;
    eventLog: EventLog;
    clock: Clock;
  },
): Promise<ArtefactEvent[]> {
  const events: ArtefactEvent[] = [];
  for (const artefact of artefacts) {
    const status = normalizeStatus(artefact.status);
    const output: { blob?: BlobRef; inline?: string } = {};

    if (artefact.inline !== undefined) {
      output.inline = artefact.inline;
    }

    const blobPayload = artefact.blob
      ?? (artefact.inline !== undefined
        ? {
            data: artefact.inline,
            mimeType: 'text/plain',
          }
        : undefined);

    if (blobPayload && status === 'succeeded') {
      output.blob = await persistBlob(context.storage, context.movieId, blobPayload);
    }

    const event: ArtefactEvent = {
      artefactId: artefact.artefactId,
      revision: context.revision,
      inputsHash: context.inputsHash,
      output,
      status,
      producedBy: context.job.jobId,
      diagnostics: artefact.diagnostics,
      createdAt: context.clock.now(),
    };

    await context.eventLog.appendArtefact(context.movieId, event);
    events.push(event);
  }
  return events;
}

async function persistBlob(
  storage: StorageContext,
  movieId: string,
  blob: ProducedArtefact['blob'],
): Promise<BlobRef> {
  if (!blob) {
    throw new Error('Expected blob payload to persist.');
  }
  const buffer = toBuffer(blob.data);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const prefix = hash.slice(0, 2);
  const relativePath = storage.resolve(movieId, 'blobs', prefix, hash);

  if (!(await storage.storage.fileExists(relativePath))) {
    await ensureDirectories(storage, relativePath);
    const tmpPath = `${relativePath}.tmp-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
    await storage.storage.write(tmpPath, buffer, { mimeType: blob.mimeType });
    await storage.storage.moveFile(tmpPath, relativePath);
  }

  return {
    hash,
    size: buffer.byteLength,
    mimeType: blob.mimeType,
  };
}

async function ensureDirectories(storage: StorageContext, fullPath: string): Promise<void> {
  const segments = fullPath.split('/').slice(0, -1);
  if (!segments.length) {
    return;
  }
  let current = '';
  for (const segment of segments) {
    current = current ? `${current}/${segment}` : segment;
    if (!(await storage.storage.directoryExists(current))) {
      await storage.storage.createDirectory(current, {});
    }
  }
}

function toBuffer(data: Uint8Array | string): Buffer {
  return typeof data === 'string' ? Buffer.from(data) : Buffer.from(data);
}

function normalizeStatus(status: ArtefactEventStatus | undefined): ArtefactEventStatus {
  if (status === 'succeeded' || status === 'failed' || status === 'skipped') {
    return status;
  }
  return 'succeeded';
}

function deriveJobStatus(
  baseStatus: ArtefactEventStatus,
  artefacts: ArtefactEvent[],
): ArtefactEventStatus {
  if (artefacts.some((event) => event.status === 'failed')) {
    return 'failed';
  }
  if (baseStatus === 'failed') {
    return 'failed';
  }
  if (artefacts.length === 0) {
    return baseStatus;
  }
  if (artefacts.every((event) => event.status === 'skipped')) {
    return baseStatus === 'succeeded' ? 'skipped' : baseStatus;
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

/**
 * Merges resolved artifact data into the job context.
 * Preserves existing resolvedInputs and adds newly resolved artifacts.
 */
function mergeResolvedArtifacts(
  job: JobDescriptor,
  resolvedArtifacts: Record<string, unknown>,
): JobDescriptor {
  // If no artifacts were resolved, return job as-is
  if (Object.keys(resolvedArtifacts).length === 0) {
    return job;
  }

  const jobContext = job.context ?? {};

  // Extract existing extras and resolvedInputs
  const extras = isRecord(jobContext) && isRecord(jobContext.extras)
    ? jobContext.extras
    : {};

  const existingResolvedInputs = isRecord(extras) && isRecord(extras.resolvedInputs)
    ? extras.resolvedInputs
    : {};

  // Merge resolved artifacts with existing resolvedInputs
  return {
    ...job,
    context: {
      ...jobContext,
      extras: {
        ...extras,
        resolvedInputs: {
          ...existingResolvedInputs,
          ...resolvedArtifacts,
        },
      },
    },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
