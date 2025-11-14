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
import { runEdit, runInteractiveEditSetup, runWorkspaceSubmit } from './commands/edit.js';
import { runProvidersList } from './commands/providers-list.js';
import { runBlueprintsList } from './commands/blueprints-list.js';
import { runBlueprintsDescribe } from './commands/blueprints-describe.js';
import { runBlueprintsValidate } from './commands/blueprints-validate.js';
import type { DryRunSummary } from './lib/dry-run.js';
import type { BuildSummary } from './lib/build.js';

const console = globalThis.console;

type ProviderListOutputEntry = Awaited<ReturnType<typeof runProvidersList>>['entries'][number];

const cli = meow(
  `\nUsage\n  $ tutopanda <command> [options]\n\nCommands\n  init                Initialize Tutopanda CLI configuration\n  query               Generate a plan using a blueprint (YAML) and inputs TOML\n  inspect             Export prompts or timeline data for a movie\n  edit                Regenerate a movie with edited inputs\n  providers:list      Show providers defined in a blueprint\n  blueprints:list     List available blueprint YAML files\n  blueprints:describe <path>  Show details for a blueprint YAML file\n  blueprints:validate <path>  Validate a blueprint YAML file\n\nExamples\n  $ tutopanda init --rootFolder=~/media/tutopanda\n  $ tutopanda query --inputs=cli/inputs-sample.toml --using-blueprint=cli/blueprints/yaml/audio-only.yaml\n  $ tutopanda providers:list --using-blueprint=cli/blueprints/yaml/audio-only.yaml\n  $ tutopanda blueprints:list\n  $ tutopanda blueprints:describe cli/blueprints/yaml/audio-only.yaml\n  $ tutopanda blueprints:validate ./my-blueprint.yaml\n  $ tutopanda inspect --movieId=q123456 --prompts\n  $ tutopanda edit --movieId=q123456 --inputs=edited-inputs.toml\n`,
  {
    importMeta: import.meta,
    flags: {
      rootFolder: { type: 'string' },
      movieId: { type: 'string' },
      prompts: { type: 'boolean', default: true },
      inputs: { type: 'string' },
      dryrun: { type: 'boolean' },
      nonInteractive: { type: 'boolean' },
      usingBlueprint: { type: 'string' },
      interactiveEdit: { type: 'boolean' },
      submitEdits: { type: 'boolean' },
    },
  },
);

async function main(): Promise<void> {
  const [command, ...rest] = cli.input;
  const flags = cli.flags as {
    rootFolder?: string;
    configPath?: string;
    movieId?: string;
    prompts?: boolean;
    inputs?: string;
    dryrun?: boolean;
    nonInteractive?: boolean;
    usingBlueprint?: string;
    interactiveEdit?: boolean;
    submitEdits?: boolean;
  };

  switch (command) {
    case 'init': {
      const result = await runInit({
        rootFolder: flags.rootFolder,
        configPath: flags.configPath,
      });
      console.log(`Initialized Tutopanda CLI at ${result.rootFolder}`);
      console.log(`Builds directory: ${result.buildsFolder}`);
      return;
    }
    case 'query': {
      if (rest.length > 0) {
        console.error('Error: query does not accept positional arguments. Provide --inputs instead.');
        process.exitCode = 1;
        return;
      }
      if (!flags.inputs) {
        console.error('Error: --inputs is required for query.');
        process.exitCode = 1;
        return;
      }
      const result = await runQuery({
        inputsPath: flags.inputs,
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
      const blueprintPath = flags.usingBlueprint;
      const result = await runProvidersList({
        blueprintPath,
      });

      if (result.entries.length === 0) {
        console.log('No producer definitions found in the blueprint.');
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
            `    ${entry.provider}/${entry.model} (${entry.environment}) -> ${statusLabel}`,
          );
        }
      }
      return;
    }
    case 'blueprints:list': {
      const result = await runBlueprintsList();

      if (result.blueprints.length === 0) {
        console.log('No blueprint TOML files found.');
        return;
      }

      console.log('Available Blueprints:\n');
      for (const blueprint of result.blueprints) {
        console.log(`  ${blueprint.name}`);
        if (blueprint.description) {
          console.log(`    ${blueprint.description}`);
        }
        if (blueprint.version) {
          console.log(`    Version: ${blueprint.version}`);
        }
        console.log(`    Path: ${blueprint.path}`);
        console.log(`    Inputs: ${blueprint.inputCount}, Outputs: ${blueprint.outputCount}`);
        console.log('');
      }
      return;
    }
    case 'blueprints:describe': {
      const blueprintPath = rest[0];
      if (!blueprintPath) {
        console.error('Error: blueprint path is required for blueprints:describe.');
        console.error('Usage: tutopanda blueprints:describe <path-to-blueprint.yaml>');
        process.exitCode = 1;
        return;
      }

      try {
        const result = await runBlueprintsDescribe({ blueprintPath });

        console.log(`Blueprint: ${result.name}`);
        if (result.description) {
          console.log(result.description);
        }
        if (result.version) {
          console.log(`Version: ${result.version}`);
        }
        console.log(`Path: ${result.path}\n`);

        console.log('Inputs:');
        if (result.inputs.length === 0) {
          console.log('  (none)');
        } else {
          for (const input of result.inputs) {
            const details = [
              `type: ${input.type}`,
              input.required ? 'required' : 'optional',
            ];
            if (input.defaultValue !== undefined) {
              details.push(`default=${JSON.stringify(input.defaultValue)}`);
            }
            console.log(
              `  • ${input.name} (${details.join(', ')})`,
            );
            if (input.description) {
              console.log(`    ${input.description}`);
            }
            console.log('');
          }
        }

        console.log('Outputs:');
        if (result.outputs.length === 0) {
          console.log('  (none)');
        } else {
          for (const output of result.outputs) {
            const details = [
              `type: ${output.type}`,
              output.required ? 'required' : 'optional',
            ];
            if (output.countInput) {
              details.push(`countInput=${output.countInput}`);
            }
            console.log(
              `  • ${output.name} (${details.join(', ')})`,
            );
            if (output.description) {
              console.log(`    ${output.description}`);
            }
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
        console.error('Usage: tutopanda blueprints:validate <path-to-blueprint.yaml>');
        process.exitCode = 1;
        return;
      }

      const result = await runBlueprintsValidate({ blueprintPath });

      if (result.valid) {
        console.log(`✓ Blueprint "${result.name ?? result.path}" is valid`);
        console.log(`Path: ${result.path}`);
        if (typeof result.nodeCount === 'number' && typeof result.edgeCount === 'number') {
          console.log(`Nodes: ${result.nodeCount}, Edges: ${result.edgeCount}`);
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
      const interactiveEdit = Boolean(flags.interactiveEdit);
      const submitEdits = Boolean(flags.submitEdits);
      if (!flags.movieId) {
        console.error('Error: --movieId is required for edit.');
        process.exitCode = 1;
        return;
      }
      if (interactiveEdit && submitEdits) {
        console.error('Error: --interactive-edit and --submitEdits cannot be combined.');
        process.exitCode = 1;
        return;
      }
      if (interactiveEdit) {
        const setup = await runInteractiveEditSetup({
          movieId: flags.movieId,
          usingBlueprint: flags.usingBlueprint,
        });
        console.log(`Workspace ready at: ${setup.workspaceDir}`);
        console.log('Edit inputs/ or artefacts/ then run:');
        console.log(`  tutopanda edit --movieId ${flags.movieId} --submitEdits`);
        return;
      }
      if (submitEdits) {
        const result = await runWorkspaceSubmit({
          movieId: flags.movieId,
          dryRun: Boolean(flags.dryrun),
          nonInteractive: Boolean(flags.nonInteractive),
          usingBlueprint: flags.usingBlueprint,
        });
        if (!result.changesApplied) {
          return;
        }
        if (result.edit) {
          console.log(`Updated movie ${flags.movieId}. New revision: ${result.edit.targetRevision}`);
          console.log(`Plan saved to ${result.edit.planPath}`);
        }
        if (result.edit?.dryRun) {
          printDryRunSummary(result.edit.dryRun, result.edit.storagePath);
        } else if (result.edit?.build) {
          printBuildSummary(result.edit.build, result.edit.manifestPath);
          console.log(`Manifests and artefacts stored under: ${result.edit.storagePath}`);
        }
        return;
      }
      if (!flags.inputs) {
        console.error('Error: --inputs is required for edit.');
        process.exitCode = 1;
        return;
      }
      const result = await runEdit({
        movieId: flags.movieId,
        inputsPath: flags.inputs,
        dryRun: Boolean(flags.dryrun),
        nonInteractive: Boolean(flags.nonInteractive),
        usingBlueprint: flags.usingBlueprint,
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
