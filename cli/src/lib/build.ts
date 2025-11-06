/* eslint-disable no-console */
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
import {
  createProviderRegistry,
  type ProviderContextPayload,
  type ProviderEnvironment,
  type ProducerHandler,
  type ResolvedProviderHandler,
  type ProviderDescriptor,
} from 'tutopanda-providers';
import type { CliConfig } from './cli-config.js';
import type { ProviderOptionsMap, LoadedProviderOption } from './provider-settings.js';

const console = globalThis.console;

export interface ExecuteBuildOptions {
  cliConfig: CliConfig;
  movieId: string;
  plan: ExecutionPlan;
  manifest: Manifest;
  manifestHash: string | null;
  providerOptions: ProviderOptionsMap;
  resolvedInputs: Record<string, unknown>;
  logger?: {
    info?(message?: string): void;
  };
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

export async function executeBuild(options: ExecuteBuildOptions): Promise<ExecuteBuildResult> {
  const storage = createStorageContext({
    kind: 'local',
    rootDir: options.cliConfig.storage.root,
    basePath: options.cliConfig.storage.basePath,
  });

  await initializeMovieStorage(storage, options.movieId);

  const eventLog = createEventLog(storage);
  const manifestService = createManifestService(storage);
  const registry = createProviderRegistry({ mode: 'live' });
  const preResolved = prepareProviderHandlers(registry, options.plan, options.providerOptions);
  await registry.warmStart?.(preResolved);
  const produce = createProviderProduce(
    registry,
    options.providerOptions,
    options.resolvedInputs,
    preResolved,
    options.logger ?? console,
  );
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
  providerOptions: ProviderOptionsMap,
  resolvedInputs: Record<string, unknown>,
  preResolved: ResolvedProviderHandler[] = [],
  logger: { info?(message?: string): void } = {},
): ProduceFn {
  const handlerCache = new Map<string, ProducerHandler>();

  for (const binding of preResolved) {
    const cacheKey = makeDescriptorKey(registry.mode, binding.descriptor.provider, binding.descriptor.model, binding.descriptor.environment);
    handlerCache.set(cacheKey, binding.handler);
  }

  return async (request) => {
    const producerName = request.job.producer;
    if (typeof producerName !== 'string') {
      return {
        jobId: request.job.jobId,
        status: 'skipped',
        artefacts: [],
      } satisfies ProduceResult;
    }

    const providerOption = resolveProviderOption(
      providerOptions,
      producerName,
      request.job.provider,
      request.job.providerModel,
    );

    const descriptorKey = makeDescriptorKey(
      registry.mode,
      providerOption.provider,
      providerOption.model,
      providerOption.environment,
    );

    let handler = handlerCache.get(descriptorKey);
    if (!handler) {
      handler = registry.resolve({
        provider: providerOption.provider,
        model: providerOption.model,
        environment: providerOption.environment,
      });
      handlerCache.set(descriptorKey, handler);
    }

    const context = buildProviderContext(providerOption, request.job.context, resolvedInputs);

    logger.info?.(
      `provider.invoke.start ${providerOption.provider}/${providerOption.model} [${providerOption.environment}] -> ${request.job.produces.join(', ')}`,
    );

    let response;
    try {
      response = await handler.invoke({
        jobId: request.job.jobId,
        provider: providerOption.provider,
        model: providerOption.model,
        revision: request.revision,
        layerIndex: request.layerIndex,
        attempt: request.attempt,
        inputs: request.job.inputs,
        produces: request.job.produces,
        context,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `ERROR: provider.invoke.failed ${providerOption.provider}/${providerOption.model} [${providerOption.environment}]: ${errorMessage}`,
      );
      throw error;
    }

    logger.info?.(
      `provider.invoke.end ${providerOption.provider}/${providerOption.model} [${providerOption.environment}]`,
    );

    const diagnostics = {
      ...response.diagnostics,
      provider: {
        ...(response.diagnostics?.provider as Record<string, unknown> | undefined),
        producer: producerName,
        provider: providerOption.provider,
        model: providerOption.model,
        environment: providerOption.environment,
        mode: handler.mode,
      },
    } satisfies Record<string, unknown>;

    return {
      jobId: request.job.jobId,
      status: response.status ?? 'succeeded',
      artefacts: response.artefacts,
      diagnostics,
    } satisfies ProduceResult;
  };
}

export function prepareProviderHandlers(
  registry: ReturnType<typeof createProviderRegistry>,
  plan: ExecutionPlan,
  providerOptions: ProviderOptionsMap,
): ResolvedProviderHandler[] {
  const descriptorMap = new Map<string, ProviderDescriptor>();
  for (const layer of plan.layers) {
    for (const job of layer) {
      if (typeof job.producer !== 'string') {
        continue;
      }
      const option = resolveProviderOption(providerOptions, job.producer, job.provider, job.providerModel);
      const key = makeDescriptorKey(registry.mode, option.provider, option.model, option.environment);
      if (!descriptorMap.has(key)) {
        descriptorMap.set(key, {
          provider: option.provider,
          model: option.model,
          environment: option.environment,
        });
      }
    }
  }
  return registry.resolveMany(Array.from(descriptorMap.values()));
}

function resolveProviderOption(
  providerOptions: ProviderOptionsMap,
  producer: string,
  provider: string,
  model: string,
): LoadedProviderOption {
  const options = providerOptions.get(producer as ProducerKind);
  if (!options || options.length === 0) {
    throw new Error(`No provider configuration defined for producer "${producer}".`);
  }
  const match = options.find((option) => option.provider === provider && option.model === model);
  if (!match) {
    throw new Error(`No provider configuration matches ${producer} -> ${provider}/${model}.`);
  }
  return match;
}

function buildProviderContext(
  option: LoadedProviderOption,
  jobContext: unknown,
  resolvedInputs: Record<string, unknown>,
): ProviderContextPayload {
  const baseConfig = normalizeProviderConfig(option);
  const rawAttachments = option.attachments.length > 0 ? option.attachments : undefined;
  const extras: Record<string, unknown> = {};
  if (isRecord(jobContext) && Object.keys(jobContext).length > 0) {
    extras.plannerContext = jobContext;
  }
  if (Object.keys(resolvedInputs).length > 0) {
    extras.resolvedInputs = resolvedInputs;
  }
  const extrasPayload = Object.keys(extras).length > 0 ? extras : undefined;

  return {
    providerConfig: baseConfig,
    rawAttachments,
    environment: option.environment,
    observability: undefined,
    extras: extrasPayload,
  } satisfies ProviderContextPayload;
}

function normalizeProviderConfig(option: LoadedProviderOption): unknown {
  const { config, customAttributes } = option;
  if (config && typeof config === 'object' && !Array.isArray(config)) {
    return customAttributes
      ? { ...config, customAttributes }
      : config;
  }
  if (customAttributes) {
    return { customAttributes, value: config };
  }
  return config;
}

function makeDescriptorKey(
  mode: string,
  provider: string,
  model: string,
  environment: ProviderEnvironment,
): string {
  return [mode, provider, model, environment].join('|');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
