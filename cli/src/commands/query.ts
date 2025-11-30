import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { getDefaultCliConfigPath, readCliConfig } from '../lib/cli-config.js';
import { generatePlan } from '../lib/planner.js';
import {
  executeDryRun,
  type DryRunSummary,
} from '../lib/dry-run.js';
import {
  executeBuild,
  type BuildSummary,
} from '../lib/build.js';
import { expandPath } from '../lib/path.js';
import { confirmPlanExecution } from '../lib/interactive-confirm.js';
import { cleanupPlanFiles } from '../lib/plan-cleanup.js';
import { resolveBlueprintSpecifier } from '../lib/config-assets.js';
import { resolveAndPersistConcurrency } from '../lib/concurrency.js';
import type { Logger } from '@tutopanda/core';

export interface QueryOptions {
  inputsPath?: string;
  inquiryPrompt?: string;
  dryRun?: boolean;
  nonInteractive?: boolean;
  usingBlueprint: string;
  concurrency?: number;
  upToLayer?: number;
  logger?: Logger;
}

export interface QueryResult {
  movieId: string;
  storageMovieId: string;
  planPath: string;
  targetRevision: string;
  dryRun?: DryRunSummary;
  build?: BuildSummary;
  manifestPath?: string;
  storagePath: string;
}

export async function runQuery(options: QueryOptions): Promise<QueryResult> {
  const logger = options.logger ?? globalThis.console;
  const inputsPath = options.inputsPath ? expandPath(options.inputsPath) : undefined;
  if (!inputsPath) {
    throw new Error('Input YAML path is required. Provide --inputs=/path/to/inputs.yaml');
  }

  if (!options.usingBlueprint || options.usingBlueprint.trim().length === 0) {
    throw new Error('Blueprint path is required. Provide --blueprint=/path/to/blueprint.yaml');
  }

  const configPath = getDefaultCliConfigPath();
  const cliConfig = await readCliConfig(configPath);
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }
  const { concurrency } = await resolveAndPersistConcurrency(cliConfig, {
    override: options.concurrency,
    configPath,
  });
  const upToLayer = options.upToLayer;
  if (options.dryRun && upToLayer !== undefined) {
    logger.info('--upToLayer applies only to live runs; dry runs will simulate all layers.');
  }

  const movieId = generateMovieId();
  const storageMovieId = formatMovieId(movieId);
  const storageRoot = cliConfig.storage.root;
  const storageBasePath = cliConfig.storage.basePath;

  const blueprintPath = await resolveBlueprintSpecifier(options.usingBlueprint, {
    cliRoot: cliConfig.storage.root,
  });

  const planResult = await generatePlan({
    cliConfig,
    movieId: storageMovieId,
    isNew: true,
    inputsPath,
    usingBlueprint: blueprintPath,
    inquiryPromptOverride: options.inquiryPrompt,
    logger,
  });

  const movieDir = resolve(storageRoot, storageBasePath, storageMovieId);

  // Interactive confirmation (skip if dry-run or non-interactive)
  if (!options.dryRun && !options.nonInteractive) {
    const confirmed = await confirmPlanExecution(planResult.plan, {
      inputs: planResult.inputEvents,
      concurrency,
      upToLayer,
      logger,
    });
    if (!confirmed) {
      await cleanupPlanFiles(movieDir);
      logger.info('\nExecution cancelled.');
      logger.info('Tip: Run with --dryrun to see what would happen without executing.');
      return {
        movieId,
        storageMovieId,
        planPath: planResult.planPath,
        targetRevision: planResult.targetRevision,
        dryRun: undefined,
        build: undefined,
        manifestPath: undefined,
        storagePath: movieDir,
      };
    }
  }

  const dryRun = options.dryRun
    ? await executeDryRun({
        movieId: storageMovieId,
        plan: planResult.plan,
        manifest: planResult.manifest,
        manifestHash: planResult.manifestHash,
        providerOptions: planResult.providerOptions,
        resolvedInputs: planResult.resolvedInputs,
        concurrency,
        storage: { rootDir: storageRoot, basePath: storageBasePath },
        logger,
      })
    : undefined;

  const buildResult = options.dryRun
    ? undefined
    : await executeBuild({
        cliConfig,
        movieId: storageMovieId,
        plan: planResult.plan,
        manifest: planResult.manifest,
        manifestHash: planResult.manifestHash,
        providerOptions: planResult.providerOptions,
        resolvedInputs: planResult.resolvedInputs,
        logger,
        concurrency,
        upToLayer,
      });

  return {
    movieId,
    storageMovieId,
    planPath: planResult.planPath,
    targetRevision: planResult.targetRevision,
    dryRun,
    build: buildResult?.summary,
    manifestPath: buildResult?.manifestPath,
    storagePath: resolve(storageRoot, storageBasePath, storageMovieId),
  };
}

function generateMovieId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function formatMovieId(publicId: string): string {
  return publicId.startsWith('movie-') ? publicId : `movie-${publicId}`;
}
