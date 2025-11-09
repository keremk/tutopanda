/* eslint-disable no-console */
import { resolve } from 'node:path';
import { readCliConfig } from '../lib/cli-config.js';
import { formatMovieId } from './query.js';
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

const console = globalThis.console;

export interface EditOptions {
  movieId: string;
  inputsPath?: string;
  dryRun?: boolean;
  nonInteractive?: boolean;
  usingBlueprint?: string;
}

export interface EditResult {
  storageMovieId: string;
  planPath: string;
  targetRevision: string;
  dryRun?: DryRunSummary;
  build?: BuildSummary;
  manifestPath?: string;
  storagePath: string;
}

export async function runEdit(options: EditOptions): Promise<EditResult> {
  const cliConfig = await readCliConfig();
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }
  if (!options.movieId) {
    throw new Error('Movie ID is required for edit.');
  }

  const storageMovieId = formatMovieId(options.movieId);
  const storageRoot = cliConfig.storage.root;
  const basePath = cliConfig.storage.basePath;
  const movieDir = resolve(storageRoot, basePath, storageMovieId);

  const inputsPath = options.inputsPath ? expandPath(options.inputsPath) : undefined;
  if (!inputsPath) {
    throw new Error('Input TOML path is required. Provide --inputs=/path/to/inputs.toml');
  }

  const planResult = await generatePlan({
    cliConfig,
    movieId: storageMovieId,
    isNew: false,
    inputsPath,
    usingBlueprint: options.usingBlueprint,
  });

  // Interactive confirmation (skip if dry-run or non-interactive)
  if (!options.dryRun && !options.nonInteractive) {
    const confirmed = await confirmPlanExecution(planResult.plan);
    if (!confirmed) {
      await cleanupPlanFiles(movieDir);
      console.log('\nExecution cancelled.');
      console.log('Tip: Run with --dryrun to see what would happen without executing.');
      return {
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
        providerOptions: planResult.providerOptions,
        resolvedInputs: planResult.resolvedInputs,
        storage: { rootDir: storageRoot, basePath },
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
        logger: console,
      });

  return {
    storageMovieId,
    planPath: planResult.planPath,
    targetRevision: planResult.targetRevision,
    dryRun,
    build: buildResult?.summary,
    manifestPath: buildResult?.manifestPath,
    storagePath: movieDir,
  };
}
