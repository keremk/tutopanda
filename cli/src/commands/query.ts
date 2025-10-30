import { readFile } from 'node:fs/promises';
import crypto from 'node:crypto';
import { resolve } from 'node:path';
import {
  loadProjectConfig,
  mergeProjectConfig,
  applyShortcutOverrides,
  parseProjectConfigOverrides,
} from '../lib/project-config.js';
import { readCliConfig } from '../lib/cli-config.js';
import { generatePlan } from '../lib/planner.js';
import {
  executeDryRun,
  type DryRunSummary,
} from '../lib/dry-run.js';

export interface QueryOptions {
  prompt: string;
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

export interface QueryResult {
  movieId: string;
  storageMovieId: string;
  planPath: string;
  targetRevision: string;
  dryRun?: DryRunSummary;
}

export async function runQuery(options: QueryOptions): Promise<QueryResult> {
  if (!options.prompt || options.prompt.trim().length === 0) {
    throw new Error('Prompt is required.');
  }

  const cliConfig = await readCliConfig();
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }

  let projectConfig = await loadProjectConfig(cliConfig.defaultSettingsPath);

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

  const movieId = generateMovieId();
  const storageMovieId = formatMovieId(movieId);

  const planResult = await generatePlan({
    cliConfig,
    projectConfig,
    prompt: options.prompt,
    movieId: storageMovieId,
    isNew: true,
  });

  const dryRun = options.dryRun
    ? await executeDryRun({
        movieId: storageMovieId,
        plan: planResult.plan,
        manifest: planResult.manifest,
      })
    : undefined;

  return {
    movieId,
    storageMovieId,
    planPath: planResult.planPath,
    targetRevision: planResult.targetRevision,
    dryRun,
  };
}

function generateMovieId(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function formatMovieId(publicId: string): string {
  return publicId.startsWith('movie-') ? publicId : `movie-${publicId}`;
}
