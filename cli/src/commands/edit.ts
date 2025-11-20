/* eslint-disable no-console */
import { Buffer } from 'node:buffer';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getDefaultCliConfigPath, readCliConfig } from '../lib/cli-config.js';
import type { CliConfig } from '../lib/cli-config.js';
import { formatMovieId } from './query.js';
import { generatePlan, type PendingArtefactDraft } from '../lib/planner.js';
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
import {
  diffWorkspace,
  exportWorkspace,
  persistWorkspaceBlob,
  readWorkspaceState,
  type WorkspaceArtefactChange,
  type WorkspaceDiffResult,
  type WorkspaceState,
} from '../lib/workspace.js';
import { readMovieMetadata } from '../lib/movie-metadata.js';
import { resolveBlueprintSpecifier } from '../lib/config-assets.js';
import { WORKSPACE_INPUTS_RELATIVE_PATH } from '../lib/input-files.js';
import { resolveAndPersistConcurrency } from '../lib/concurrency.js';

const console = globalThis.console;

export interface EditOptions {
  movieId: string;
  inputsPath?: string;
  dryRun?: boolean;
  nonInteractive?: boolean;
  usingBlueprint?: string;
  pendingArtefacts?: PendingArtefactDraft[];
  concurrency?: number;
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
  const configPath = getDefaultCliConfigPath();
  const cliConfig = await readCliConfig(configPath);
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }
  if (!options.movieId) {
    throw new Error('Movie ID is required for edit.');
  }
  const { concurrency } = await resolveAndPersistConcurrency(cliConfig, {
    override: options.concurrency,
    configPath,
  });

  const storageMovieId = formatMovieId(options.movieId);
  const storageRoot = cliConfig.storage.root;
  const basePath = cliConfig.storage.basePath;
  const movieDir = resolve(storageRoot, basePath, storageMovieId);

  const inputsPath = options.inputsPath ? expandPath(options.inputsPath) : undefined;
  if (!inputsPath) {
    throw new Error('Input YAML path is required. Provide --inputs=/path/to/inputs.yaml');
  }

  const metadata = await readMovieMetadata(movieDir);
  const blueprintInput = options.usingBlueprint ?? metadata?.blueprintPath;
  if (!blueprintInput) {
    throw new Error(
      'Blueprint path is required for edit. Provide --usingBlueprint=/path/to/blueprint.yaml or re-run the initial query to capture blueprint metadata.',
    );
  }
  const blueprintPath = await resolveBlueprintSpecifier(blueprintInput, {
    cliRoot: cliConfig.storage.root,
  });

  const planResult = await generatePlan({
    cliConfig,
    movieId: storageMovieId,
    isNew: false,
    inputsPath,
    usingBlueprint: blueprintPath,
    pendingArtefacts: options.pendingArtefacts,
  });

  const hasJobs = planResult.plan.layers.some((layer) => layer.length > 0);

  // Interactive confirmation (skip if dry-run, non-interactive, or no work to perform)
  if (hasJobs && !options.dryRun && !options.nonInteractive) {
    const confirmed = await confirmPlanExecution(planResult.plan, {
      inputs: planResult.inputEvents,
      concurrency,
    });
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
        concurrency,
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
        concurrency,
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

export interface InteractiveEditOptions {
  movieId: string;
  usingBlueprint?: string;
}

export interface InteractiveEditResult {
  workspaceDir: string;
  state: WorkspaceState;
}

export async function runInteractiveEditSetup(options: InteractiveEditOptions): Promise<InteractiveEditResult> {
  const cliConfig = await readCliConfig();
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }
  if (!options.movieId) {
    throw new Error('Movie ID is required for interactive edit.');
  }

  const storageMovieId = formatMovieId(options.movieId);
  const blueprintOverride = options.usingBlueprint
    ? await resolveBlueprintSpecifier(options.usingBlueprint, { cliRoot: cliConfig.storage.root })
    : undefined;
  const result = await exportWorkspace({
    cliConfig,
    movieId: storageMovieId,
    blueprintOverride,
  });
  return result;
}

export interface WorkspaceSubmitOptions {
  movieId: string;
  dryRun?: boolean;
  nonInteractive?: boolean;
  usingBlueprint?: string;
  concurrency?: number;
}

export interface WorkspaceSubmitResult {
  workspaceDir: string;
  state: WorkspaceState;
  edit?: EditResult;
  changesApplied: boolean;
}

export async function runWorkspaceSubmit(options: WorkspaceSubmitOptions): Promise<WorkspaceSubmitResult> {
  const cliConfig = await readCliConfig();
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }
  if (!options.movieId) {
    throw new Error('Movie ID is required for submit.');
  }

  const storageMovieId = formatMovieId(options.movieId);
  const workspaceDir = resolve(cliConfig.storage.root, 'workspaces', storageMovieId);
  const state = await readWorkspaceState(workspaceDir).catch((error) => {
    throw new Error(
      `Workspace not found for ${storageMovieId}. Run "tutopanda edit --movieId ${storageMovieId} --interactive-edit" first.\n${error instanceof Error ? error.message : String(error)}`,
    );
  });

  const diff = await diffWorkspace(state, workspaceDir);
  if (!diff.inputsChanged && diff.artefacts.length === 0) {
    console.log('No edits detected in workspace. Nothing to submit.');
    return { workspaceDir, state, changesApplied: false };
  }

  printWorkspaceSummary(diff, workspaceDir);

  const inputsPath = resolve(workspaceDir, state.inputs.file);
  const pendingArtefacts = await buildPendingArtefactDrafts({
    cliConfig,
    movieId: storageMovieId,
    changes: diff.artefacts,
  });

  const blueprintSource = options.usingBlueprint ?? state.blueprintPath;
  if (!blueprintSource) {
    throw new Error(
      'No blueprint recorded in workspace. Provide --usingBlueprint=/path/to/blueprint.yaml when submitting.',
    );
  }
  const blueprintPath = await resolveBlueprintSpecifier(blueprintSource, {
    cliRoot: cliConfig.storage.root,
  });
  const editResult = await runEdit({
    movieId: storageMovieId,
    inputsPath,
    dryRun: options.dryRun,
    nonInteractive: options.nonInteractive,
    usingBlueprint: blueprintPath,
    pendingArtefacts,
    concurrency: options.concurrency,
  });

  if (!options.dryRun) {
    await exportWorkspace({
      cliConfig,
      movieId: storageMovieId,
      blueprintOverride: blueprintPath,
    });
  }

  return {
    workspaceDir,
    state,
    edit: editResult,
    changesApplied: true,
  };
}

function printWorkspaceSummary(diff: WorkspaceDiffResult, workspaceDir: string): void {
  console.log('Detected workspace edits:');
  if (diff.inputsChanged) {
    console.log(`- Inputs updated (${workspaceDir}/${WORKSPACE_INPUTS_RELATIVE_PATH})`);
  }
  for (const change of diff.artefacts) {
    console.log(`- Artefact ${change.entry.id} (${resolve(workspaceDir, change.entry.file)})`);
  }
}

async function buildPendingArtefactDrafts(args: {
  cliConfig: CliConfig;
  movieId: string;
  changes: WorkspaceArtefactChange[];
}): Promise<PendingArtefactDraft[]> {
  const pending: PendingArtefactDraft[] = [];
  for (const change of args.changes) {
    const treatAsInline =
      change.kind === 'inline'
      || (typeof change.mimeType === 'string' && change.mimeType.startsWith('text/'));
    if (treatAsInline) {
      const inlineValue = await readFile(change.absolutePath, 'utf8');
      const blobRef = await persistWorkspaceBlob({
        cliConfig: args.cliConfig,
        movieId: args.movieId,
        data: Buffer.from(inlineValue, 'utf8'),
        mimeType: change.mimeType ?? 'text/plain',
      });
      pending.push({
        artefactId: change.entry.id,
        producedBy: 'workspace-edit',
        output: {
          inline: inlineValue,
          blob: blobRef,
        },
        diagnostics: { source: 'workspace' },
      });
      continue;
    }
    const data = await readFile(change.absolutePath);
    const blobRef = await persistWorkspaceBlob({
      cliConfig: args.cliConfig,
      movieId: args.movieId,
      data,
      mimeType: change.mimeType ?? 'application/octet-stream',
    });
    pending.push({
      artefactId: change.entry.id,
      producedBy: 'workspace-edit',
      output: {
        blob: blobRef,
      },
      diagnostics: { source: 'workspace' },
    });
  }
  return pending;
}
