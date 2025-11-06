#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-console */
import { config as dotenvConfig } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import meow from 'meow';

// Load .env from multiple locations (CLI folder and current working directory)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenvConfig({ path: resolve(__dirname, '..', '.env') }); // CLI folder
dotenvConfig({ path: resolve(process.cwd(), '.env'), override: false }); // Current working directory (if exists)
import { runInit } from './commands/init.js';
import { runQuery } from './commands/query.js';
import { runInspect } from './commands/inspect.js';
import { runEdit } from './commands/edit.js';
import { runProvidersList } from './commands/providers-list.js';
import { runBlueprintsList } from './commands/blueprints-list.js';
import { runBlueprintsDescribe } from './commands/blueprints-describe.js';
import { runBlueprintsValidate } from './commands/blueprints-validate.js';
import type { DryRunSummary } from './lib/dry-run.js';
import type { BuildSummary } from './lib/build.js';

const console = globalThis.console;

type ProviderListOutputEntry = Awaited<ReturnType<typeof runProvidersList>>['entries'][number];

const cli = meow(
  `\nUsage\n  $ tutopanda <command> [options]\n\nCommands\n  init                Initialize Tutopanda CLI configuration\n  query <prompt>      Generate a plan for a new movie using defaults + overrides\n  inspect             Export prompts or timeline data for a movie\n  edit                Apply prompt/config edits and regenerate a movie\n  providers:list      Show configured provider variants and readiness status\n  blueprints:list     List available blueprint sections\n  blueprints:describe <section>  Show ports for a blueprint section\n  blueprints:validate <file>     Validate a custom blueprint file\n\nExamples\n  $ tutopanda init --rootFolder=~/media/tutopanda --defaultSettings=~/media/tutopanda/default-settings.json\n  $ tutopanda query "Tell me about the Civil War" --style=Pixar --voice=Clara\n  $ tutopanda query "Video from an image" --using-blueprint=./blueprints/full-video.json\n  $ tutopanda providers:list\n  $ tutopanda blueprints:list\n  $ tutopanda blueprints:describe audio\n  $ tutopanda blueprints:validate ./my-blueprint.json\n  $ tutopanda inspect --movieId=q123456 --prompts\n  $ tutopanda edit --movieId=q123456 --inputs=edited-prompts.toml\n`,
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
      nonInteractive: { type: 'boolean' },
      usingBlueprint: { type: 'string' },
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
    nonInteractive?: boolean;
    usingBlueprint?: string;
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
        nonInteractive: Boolean(flags.nonInteractive),
        usingBlueprint: flags.usingBlueprint,
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
    case 'providers:list': {
      const result = await runProvidersList({
        settingsPath: flags.settings ?? flags.settingsPath,
      });

      if (result.entries.length === 0) {
        console.log('No provider configurations found in the current settings.');
        return;
      }

      const byProducer = new Map<string, ProviderListOutputEntry[]>();
      for (const entry of result.entries) {
        const bucket = byProducer.get(entry.producer) ?? [];
        bucket.push(entry);
        byProducer.set(entry.producer, bucket);
      }

      console.log('Provider configurations:');
      for (const [producer, entries] of byProducer) {
        console.log(`- ${producer}`);
        for (const entry of entries) {
          const statusLabel = entry.status === 'ready' ? 'ready' : `error: ${entry.message ?? 'unavailable'}`;
          console.log(
            `    [${entry.priority}] ${entry.provider}/${entry.model} (${entry.environment}) -> ${statusLabel}`,
          );
        }
      }
      return;
    }
    case 'blueprints:list': {
      const result = await runBlueprintsList();

      console.log('Available Blueprint Sections:\n');
      for (const section of result.sections) {
        console.log(`  ${section.id}`);
        console.log(`    ${section.label}`);
        console.log(`    Inputs: ${section.inputCount}, Outputs: ${section.outputCount}`);
        console.log('');
      }
      return;
    }
    case 'blueprints:describe': {
      const sectionId = rest[0];
      if (!sectionId) {
        console.error('Error: section ID is required for blueprints:describe.');
        console.error('Usage: tutopanda blueprints:describe <section-id>');
        process.exitCode = 1;
        return;
      }

      try {
        const result = await runBlueprintsDescribe({ sectionId });

        console.log(`Section: ${result.id}`);
        console.log(`Label: ${result.label}\n`);

        console.log('Input Ports:');
        if (result.inputs.length === 0) {
          console.log('  (none)');
        } else {
          for (const input of result.inputs) {
            console.log(`  • ${input.name} (${input.cardinality}${input.required ? ', required' : ''})`);
            if (input.description) {
              console.log(`    ${input.description}`);
            }
            console.log(`    Ref: ${input.ref.kind}:${input.ref.id}`);
            console.log('');
          }
        }

        console.log('Output Ports:');
        if (result.outputs.length === 0) {
          console.log('  (none)');
        } else {
          for (const output of result.outputs) {
            console.log(`  • ${output.name} (${output.cardinality}${output.required ? ', required' : ''})`);
            if (output.description) {
              console.log(`    ${output.description}`);
            }
            console.log(`    Ref: ${output.ref.kind}:${output.ref.id}`);
            console.log('');
          }
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
        process.exitCode = 1;
      }
      return;
    }
    case 'blueprints:validate': {
      const blueprintPath = rest[0];
      if (!blueprintPath) {
        console.error('Error: blueprint file path is required for blueprints:validate.');
        console.error('Usage: tutopanda blueprints:validate <file-path>');
        process.exitCode = 1;
        return;
      }

      const result = await runBlueprintsValidate({ blueprintPath });

      if (result.valid) {
        console.log(`✓ Blueprint "${result.config.name}" is valid\n`);
        console.log(`Description: ${result.config.description || '(none)'}`);
        console.log(`Sections: ${result.config.sections.join(', ')}`);
        console.log(`Connections: ${result.config.connections.length}`);

        if (result.warnings.length > 0) {
          console.log('\nWarnings:');
          for (const warning of result.warnings) {
            console.log(`  ⚠ ${warning.message}`);
          }
        }
      } else {
        console.error(`✗ Blueprint validation failed\n`);
        console.error(`Error: ${result.error}`);
        process.exitCode = 1;
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
        nonInteractive: Boolean(flags.nonInteractive),
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
