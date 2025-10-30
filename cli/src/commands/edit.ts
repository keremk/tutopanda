import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseProjectConfig } from 'tutopanda-core';
import { readCliConfig } from '../lib/cli-config.js';
import {
  loadProjectConfig,
  mergeProjectConfig,
  applyShortcutOverrides,
  parseProjectConfigOverrides,
} from '../lib/project-config.js';
import { formatMovieId } from './query.js';
import { generatePlan } from '../lib/planner.js';
import { parsePromptsToml, writePromptFile } from '../lib/prompts.js';
import {
  executeDryRun,
  type DryRunSummary,
} from '../lib/dry-run.js';

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
}

export interface EditResult {
  storageMovieId: string;
  planPath: string;
  targetRevision: string;
  dryRun?: DryRunSummary;
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

  let projectConfig = await loadMovieProjectConfig(movieDir, cliConfig.defaultSettingsPath);

  if (options.settingsPath) {
    const overridesRaw = await readFile(resolve(options.settingsPath), 'utf8');
    const parsedOverrides = parseProjectConfigOverrides(JSON.parse(overridesRaw));
    projectConfig = mergeProjectConfig(projectConfig, parsedOverrides);
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

  let prompt = await readExistingPrompt(movieDir);

  if (options.inputsPath) {
    const toml = await readFile(resolve(options.inputsPath), 'utf8');
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
    prompt,
    movieId: storageMovieId,
    isNew: false,
  });

  const dryRun = options.dryRun
    ? await executeDryRun({
        movieId: storageMovieId,
        plan: planResult.plan,
        manifest: planResult.manifest,
      })
    : undefined;

  return {
    storageMovieId,
    planPath: planResult.planPath,
    targetRevision: planResult.targetRevision,
    dryRun,
  };
}

async function loadMovieProjectConfig(movieDir: string, fallbackConfigPath: string) {
  try {
    const contents = await readFile(resolve(movieDir, 'config.json'), 'utf8');
    return parseProjectConfig(JSON.parse(contents));
  } catch {
    return loadProjectConfig(fallbackConfigPath);
  }
}

async function readExistingPrompt(movieDir: string): Promise<string | undefined> {
  try {
    return await readFile(resolve(movieDir, 'prompts/inquiry.txt'), 'utf8');
  } catch {
    return undefined;
  }
}
