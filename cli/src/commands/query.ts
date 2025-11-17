/* eslint-disable no-console */
import crypto from 'node:crypto';
import { resolve } from 'node:path';
import { readCliConfig } from '../lib/cli-config.js';
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

const console = globalThis.console;

export interface QueryOptions {
  inputsPath?: string;
  inquiryPrompt?: string;
  dryRun?: boolean;
  nonInteractive?: boolean;
  usingBlueprint: string;
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
  const inputsPath = options.inputsPath ? expandPath(options.inputsPath) : undefined;
  if (!inputsPath) {
    throw new Error('Input YAML path is required. Provide --inputs=/path/to/inputs.yaml');
  }

  if (!options.usingBlueprint || options.usingBlueprint.trim().length === 0) {
    throw new Error('Blueprint path is required. Provide --usingBlueprint=/path/to/blueprint.yaml');
  }

  const cliConfig = await readCliConfig();
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
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
  });

  const movieDir = resolve(storageRoot, storageBasePath, storageMovieId);

  // Interactive confirmation (skip if dry-run or non-interactive)
  if (!options.dryRun && !options.nonInteractive) {
    const confirmed = await confirmPlanExecution(planResult.plan, {
      inputs: planResult.inputEvents,
    });
    if (!confirmed) {
      await cleanupPlanFiles(movieDir);
      console.log('\nExecution cancelled.');
      console.log('Tip: Run with --dryrun to see what would happen without executing.');
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
        providerOptions: planResult.providerOptions,
        resolvedInputs: planResult.resolvedInputs,
        storage: { rootDir: storageRoot, basePath: storageBasePath },
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
