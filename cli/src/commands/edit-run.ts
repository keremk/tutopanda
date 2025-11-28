import readline from 'node:readline';
import process from 'node:process';
import { resolve } from 'node:path';
import { rm } from 'node:fs/promises';
import { getDefaultCliConfigPath, readCliConfig } from '../lib/cli-config.js';
import { formatMovieId } from './query.js';
import { runEdit, type EditResult } from './edit.js';
import { loadCurrentManifest, prepareFriendlyPreflight, buildFriendlyView } from '../lib/friendly-view.js';
import type { Logger } from '@tutopanda/core';

export interface EditRunOptions {
  movieId: string;
  dryRun?: boolean;
  nonInteractive?: boolean;
  usingBlueprint?: string;
  concurrency?: number;
  upToLayer?: number;
  logger?: Logger;
}

export interface EditRunResult extends EditResult {
  friendlyRoot: string;
}

export async function runEditRun(options: EditRunOptions): Promise<EditRunResult> {
  const logger = options.logger ?? globalThis.console;
  const configPath = getDefaultCliConfigPath();
  const cliConfig = await readCliConfig(configPath);
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }
  if (!options.movieId) {
    throw new Error('Movie ID is required for edit:run.');
  }

  const storageMovieId = formatMovieId(options.movieId);
  const { manifest } = await loadCurrentManifest(cliConfig, storageMovieId);

  const preflight = await prepareFriendlyPreflight({
    cliConfig,
    movieId: storageMovieId,
    manifest,
    allowShardedBlobs: true,
  });

  if (!preflight.changed) {
    logger.info('No artefact changes detected in friendly view. Proceeding to run in case of prior failures.');
  } else {
    logger.info(`Detected ${preflight.pendingArtefacts.length} artefact change(s) from friendly edits.`);
  }

  const editResult = await runEdit({
    movieId: storageMovieId,
    dryRun: options.dryRun,
    nonInteractive: options.nonInteractive,
    usingBlueprint: options.usingBlueprint,
    pendingArtefacts: preflight.pendingArtefacts,
    concurrency: options.concurrency,
    upToLayer: options.upToLayer,
    logger,
  });

  if (!options.dryRun && editResult.build) {
    // Refresh the friendly view to reflect the new manifest contents.
    const { manifest: nextManifest } = await loadCurrentManifest(cliConfig, storageMovieId);
    await buildFriendlyView({ cliConfig, movieId: storageMovieId, manifest: nextManifest });
  }

  return { ...editResult, friendlyRoot: preflight.friendly.friendlyRoot };
}

export async function runEditClean(options: { movieId: string; logger?: Logger }): Promise<void> {
  const logger = options.logger ?? globalThis.console;
  const cliConfig = await readCliConfig();
  if (!cliConfig) {
    throw new Error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
  }
  if (!options.movieId) {
    throw new Error('Movie ID is required for edit:clean.');
  }
  const storageMovieId = formatMovieId(options.movieId);
  const friendlyRoot = resolve(cliConfig.storage.root, 'movies', storageMovieId);
  const buildsRoot = resolve(cliConfig.storage.root, cliConfig.storage.basePath, storageMovieId);

  const confirmed = await promptConfirm(
    logger,
    `This will delete ${friendlyRoot} and ${buildsRoot}. Proceed? (y/n): `,
  );
  if (!confirmed) {
    logger.info('Clean cancelled.');
    return;
  }

  await rm(friendlyRoot, { recursive: true, force: true });
  await rm(buildsRoot, { recursive: true, force: true });
  logger.info('Removed friendly view and build artefacts.');
}

function promptConfirm(logger: Logger, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      const ok = normalized === 'y' || normalized === 'yes';
      if (!ok) {
        logger.info('Operation aborted by user.');
      }
      resolve(ok);
    });
  });
}
