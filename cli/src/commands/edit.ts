/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { parseProjectConfig, type ProjectConfig } from 'tutopanda-core';
import { readCliConfig } from '../lib/cli-config.js';
import {
  mergeProjectConfig,
  applyShortcutOverrides,
} from '../lib/project-config.js';
import { formatMovieId } from './query.js';
import { generatePlan } from '../lib/planner.js';
import { parsePromptsToml, writePromptFile } from '../lib/prompts.js';
import {
  executeDryRun,
  type DryRunSummary,
} from '../lib/dry-run.js';
import {
  executeBuild,
  type BuildSummary,
} from '../lib/build.js';
import {
  loadSettings,
  loadSettingsOverrides,
  mergeProviderOptions,
  providerOptionsFromJSON,
  applyProviderShortcutOverrides,
} from '../lib/provider-settings.js';
import { expandPath } from '../lib/path.js';
import { confirmPlanExecution } from '../lib/interactive-confirm.js';
import { cleanupPlanFiles } from '../lib/plan-cleanup.js';

const console = globalThis.console;

export interface EditOptions {
  movieId: string;
  inputsPath?: string;
  settingsPath?: string;
  style?: string;
  voice?: string;
  useVideo?: boolean;
  audience?: string;
  language?: string;
  duration?: number;
  aspectRatio?: string;
  size?: string;
  dryRun?: boolean;
  nonInteractive?: boolean;
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

  const baseSettings = await loadSettings(cliConfig.defaultSettingsPath);
  let projectConfig = await loadMovieProjectConfig(movieDir, baseSettings.projectConfig);
  let providerOptions = (await loadStoredProviderOptions(movieDir)) ?? baseSettings.providerOptions;

  if (options.settingsPath) {
    const overrides = await loadSettingsOverrides(expandPath(options.settingsPath));
    projectConfig = mergeProjectConfig(projectConfig, overrides.projectConfig);
    providerOptions = mergeProviderOptions(providerOptions, overrides.providerOptions);
  }

  projectConfig = applyShortcutOverrides(projectConfig, {
    style: options.style,
    voice: options.voice,
    useVideo: options.useVideo,
    audience: options.audience,
    language: options.language,
    duration: options.duration,
    aspectRatio: options.aspectRatio,
    size: options.size,
  });

  providerOptions = applyProviderShortcutOverrides(providerOptions, {
    voice: options.voice,
  });

  let prompt = await readExistingPrompt(movieDir);

  if (options.inputsPath) {
    const toml = await readFile(expandPath(options.inputsPath), 'utf8');
    const promptMap = parsePromptsToml(toml);
    if (promptMap.inquiry !== undefined) {
      prompt = promptMap.inquiry;
      await writePromptFile(movieDir, 'prompts/inquiry.txt', prompt);
    }
  }

  if (prompt === undefined) {
    throw new Error('Unable to locate inquiry prompt. Run "tutopanda inspect" to export prompts first.');
  }

  const planResult = await generatePlan({
    cliConfig,
    projectConfig,
    providerOptions,
    prompt,
    movieId: storageMovieId,
    isNew: false,
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
        providerOptions,
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
        providerOptions,
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

async function loadMovieProjectConfig(movieDir: string, fallbackConfig: ProjectConfig) {
  try {
    const contents = await readFile(resolve(movieDir, 'config.json'), 'utf8');
    return parseProjectConfig(JSON.parse(contents));
  } catch {
    return fallbackConfig;
  }
}

async function loadStoredProviderOptions(movieDir: string) {
  try {
    const contents = await readFile(join(movieDir, 'providers.json'), 'utf8');
    return providerOptionsFromJSON(JSON.parse(contents));
  } catch {
    return null;
  }
}

async function readExistingPrompt(movieDir: string): Promise<string | undefined> {
  try {
    return await readFile(resolve(movieDir, 'prompts/inquiry.txt'), 'utf8');
  } catch {
    return undefined;
  }
}
