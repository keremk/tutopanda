#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-console */
import process from 'node:process';
import meow from 'meow';
import { runInit } from './commands/init.js';
import { runQuery } from './commands/query.js';
import { runInspect } from './commands/inspect.js';
import { runEdit } from './commands/edit.js';
import type { DryRunSummary } from './lib/dry-run.js';
import type { BuildSummary } from './lib/build.js';

const console = globalThis.console;

const cli = meow(
  `\nUsage\n  $ tutopanda <command> [options]\n\nCommands\n  init              Initialize Tutopanda CLI configuration\n  query <prompt>    Generate a plan for a new movie using defaults + overrides\n  inspect           Export prompts or timeline data for a movie\n  edit              Apply prompt/config edits and regenerate a movie\n\nExamples\n  $ tutopanda init --rootFolder=~/media/tutopanda --defaultSettings=~/media/tutopanda/default-settings.json\n  $ tutopanda query "Tell me about the Civil War" --style=Pixar --voice=Clara\n  $ tutopanda inspect --movieId=q123456 --prompts\n  $ tutopanda edit --movieId=q123456 --inputs=edited-prompts.toml\n`,
  {
    importMeta: import.meta,
    flags: {
      rootFolder: { type: 'string' },
      defaultSettings: { type: 'string' },
      settings: { type: 'string' },
      settingsPath: { type: 'string' },
      style: { type: 'string' },
      voice: { type: 'string' },
      useVideo: { type: 'boolean' },
      audience: { type: 'string' },
      language: { type: 'string' },
      duration: { type: 'number' },
      aspectRatio: { type: 'string' },
      size: { type: 'string' },
      movieId: { type: 'string' },
      prompts: { type: 'boolean', default: true },
      inputs: { type: 'string' },
      dryrun: { type: 'boolean' },
    },
  },
);

async function main(): Promise<void> {
  const [command, ...rest] = cli.input;
  const flags = cli.flags as {
    rootFolder?: string;
    defaultSettings?: string;
    configPath?: string;
    settings?: string;
    settingsPath?: string;
    style?: string;
    voice?: string;
    useVideo?: boolean;
    audience?: string;
    language?: string;
    duration?: number;
    aspectRatio?: string;
    size?: string;
    movieId?: string;
    prompts?: boolean;
    inputs?: string;
    dryrun?: boolean;
  };

  switch (command) {
    case 'init': {
      const result = await runInit({
        rootFolder: flags.rootFolder,
        defaultSettings: flags.defaultSettings,
        configPath: flags.configPath,
      });
      console.log(`Initialized Tutopanda CLI at ${result.rootFolder}`);
      console.log(`Default settings: ${result.defaultSettingsPath}`);
      console.log(`Builds directory: ${result.buildsFolder}`);
      return;
    }
    case 'query': {
      const prompt = rest.join(' ').trim();
      if (!prompt) {
        console.error('Error: prompt is required for query.');
        process.exitCode = 1;
        return;
      }
      const result = await runQuery({
        prompt,
        settingsPath: flags.settings ?? flags.settingsPath,
        style: flags.style,
        voice: flags.voice,
        useVideo: flags.useVideo,
        audience: flags.audience,
        language: flags.language,
        duration: flags.duration,
        aspectRatio: flags.aspectRatio,
        size: flags.size,
        dryRun: Boolean(flags.dryrun),
      });
      console.log(`Movie created with id = ${result.movieId}`);
      console.log(`Plan saved to ${result.planPath}`);
      if (result.dryRun) {
        printDryRunSummary(result.dryRun, result.storagePath);
      } else if (result.build) {
        printBuildSummary(result.build, result.manifestPath);
        console.log(`Manifests and artefacts stored under: ${result.storagePath}`);
      }
      return;
    }
    case 'inspect': {
      if (!flags.movieId) {
        console.error('Error: --movieId is required for inspect.');
        process.exitCode = 1;
        return;
      }
      const result = await runInspect({
        movieId: flags.movieId,
        prompts: flags.prompts,
      });
      if (result.promptsToml) {
        console.log(result.promptsToml);
      } else {
        console.log('No prompts found for the specified movie.');
      }
      return;
    }
    case 'edit': {
      if (!flags.movieId) {
        console.error('Error: --movieId is required for edit.');
        process.exitCode = 1;
        return;
      }
      const result = await runEdit({
        movieId: flags.movieId,
        inputsPath: flags.inputs,
        settingsPath: flags.settings ?? flags.settingsPath,
        style: flags.style,
        voice: flags.voice,
        useVideo: flags.useVideo,
        audience: flags.audience,
        language: flags.language,
        duration: flags.duration,
        aspectRatio: flags.aspectRatio,
        size: flags.size,
        dryRun: Boolean(flags.dryrun),
      });
      console.log(`Updated prompts for movie ${flags.movieId}. New revision: ${result.targetRevision}`);
      console.log(`Plan saved to ${result.planPath}`);
      if (result.dryRun) {
        printDryRunSummary(result.dryRun, result.storagePath);
      } else if (result.build) {
        printBuildSummary(result.build, result.manifestPath);
        console.log(`Manifests and artefacts stored under: ${result.storagePath}`);
      }
      return;
    }
    default: {
      cli.showHelp();
    }
  }
}

void main();

function printDryRunSummary(summary: DryRunSummary, storagePath: string): void {
  const counts = summary.statusCounts;
  console.log(
    `Dry run status: ${summary.status}. Layers: ${summary.layers}. Jobs: ${summary.jobCount} (succeeded ${counts.succeeded}, failed ${counts.failed}, skipped ${counts.skipped}).`,
  );

  const byProducer = new Map<string, number>();
  for (const job of summary.jobs) {
    byProducer.set(job.producer, (byProducer.get(job.producer) ?? 0) + 1);
  }
  if (byProducer.size > 0) {
    console.log('Re-executed producers:');
    for (const [producer, count] of byProducer) {
      console.log(`  ${producer}: ${count}`);
    }
  }

  const preview = summary.jobs.slice(0, 5);
  if (preview.length === 0) {
    console.log(`Mock artefacts and logs stored under: ${storagePath}`);
    return;
  }
  console.log('Sample jobs:');
  for (const job of preview) {
    console.log(`  [Layer ${job.layerIndex}] ${job.producer} -> ${job.status}`);
  }
  if (summary.jobs.length > preview.length) {
    console.log(`  … ${summary.jobs.length - preview.length} more`);
  }
  console.log(`Mock artefacts and logs stored under: ${storagePath}`);
}

function printBuildSummary(summary: BuildSummary, manifestPath?: string): void {
  const counts = summary.counts;
  console.log(
    `Build status: ${summary.status}. Jobs: ${summary.jobCount} (succeeded ${counts.succeeded}, failed ${counts.failed}, skipped ${counts.skipped}). Manifest revision: ${summary.manifestRevision}.`,
  );
  if (manifestPath) {
    console.log(`Manifest saved to ${manifestPath}`);
  }
}
