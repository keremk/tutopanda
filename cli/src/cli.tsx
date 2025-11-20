#!/usr/bin/env node
/* eslint-env node */
/* eslint-disable no-console */
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import meow from 'meow';

sanitizeDebugEnvVar('DEBUG');
sanitizeDebugEnvVar('NODE_DEBUG');
delete process.env.DOTENV_CONFIG_DEBUG;

const __dirname = dirname(fileURLToPath(import.meta.url));
const restoreStdout = silenceStdout();
try {
  const { config: dotenvConfig } = await import('dotenv');
  dotenvConfig({ path: resolve(__dirname, '..', '.env') });
  dotenvConfig({ path: resolve(process.cwd(), '.env'), override: false });
} finally {
  restoreStdout();
}
function sanitizeDebugEnvVar(name: 'DEBUG' | 'NODE_DEBUG'): void {
  const value = process.env[name];
  if (!value) {
    return;
  }
  const sanitized = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0 && !entry.toLowerCase().includes('dotenv'));
  if (sanitized.length > 0) {
    process.env[name] = sanitized.join(',');
  } else {
    delete process.env[name];
  }
}

function silenceStdout(): () => void {
  const stream = process.stdout;
  const originalWrite = stream.write;
  stream.write = (() => true) as typeof stream.write;
  return () => {
    stream.write = originalWrite;
  };
}
import { runInit } from './commands/init.js';
import { runQuery } from './commands/query.js';
import { runInspect } from './commands/inspect.js';
import { runEdit, runInteractiveEditSetup, runWorkspaceSubmit } from './commands/edit.js';
import { runProvidersList } from './commands/providers-list.js';
import { runBlueprintsList } from './commands/blueprints-list.js';
import { runBlueprintsDescribe } from './commands/blueprints-describe.js';
import { runViewerStart, runViewerStop, runViewerView } from './commands/viewer.js';
import { runBlueprintsValidate } from './commands/blueprints-validate.js';
import { runMcpServer } from './commands/mcp.js';
import type { DryRunSummary, DryRunJobSummary } from './lib/dry-run.js';
import type { BuildSummary } from './lib/build.js';
import { readCliConfig } from './lib/cli-config.js';
import {
  getBundledBlueprintsRoot,
  getCliBlueprintsRoot,
  resolveBlueprintSpecifier,
} from './lib/config-assets.js';

const console = globalThis.console;

type ProviderListOutputEntry = Awaited<ReturnType<typeof runProvidersList>>['entries'][number];

const cli = meow(
  `\nUsage\n  $ tutopanda <command> [options]\n\nCommands\n  install             Guided setup (alias for init)\n  init                Initialize Tutopanda CLI configuration\n  query               Generate a plan using a blueprint (YAML) and inputs YAML\n  inspect             Export prompts or timeline data for a movie\n  edit                Regenerate a movie with edited inputs\n  viewer:start        Start the bundled viewer server in the foreground\n  viewer:view         Open the viewer for a movie id (starts server if needed)\n  viewer:stop         Stop the background viewer server\n  providers:list      Show providers defined in a blueprint\n  blueprints:list     List available blueprint YAML files\n  blueprints:describe <path>  Show details for a blueprint YAML file\n  blueprints:validate <path>  Validate a blueprint YAML file\n  mcp                 Run the Tutopanda MCP server over stdio\n\nExamples\n  $ tutopanda install --rootFolder=~/media/tutopanda\n  $ tutopanda query --inputs=~/movies/my-inputs.yaml --using-blueprint=audio-only.yaml\n  $ tutopanda query --inputs=~/movies/my-inputs.yaml --using-blueprint=audio-only.yaml --concurrency=3\n  $ tutopanda providers:list --using-blueprint=image-audio.yaml\n  $ tutopanda blueprints:list\n  $ tutopanda blueprints:describe audio-only.yaml\n  $ tutopanda blueprints:validate image-audio.yaml\n  $ tutopanda inspect --movieId=q123456 --prompts\n  $ tutopanda edit --movieId=q123456 --inputs=edited-inputs.yaml\n  $ tutopanda viewer:start\n  $ tutopanda viewer:view --movieId=q123456\n  $ tutopanda mcp --defaultBlueprint=image-audio.yaml\n`,
  {
    importMeta: import.meta,
    flags: {
      config: { type: 'string' },
      rootFolder: { type: 'string' },
      movieId: { type: 'string' },
      prompts: { type: 'boolean', default: true },
      inputs: { type: 'string' },
      dryrun: { type: 'boolean' },
      nonInteractive: { type: 'boolean' },
      usingBlueprint: { type: 'string' },
      concurrency: { type: 'number' },
      interactiveEdit: { type: 'boolean' },
      submitEdits: { type: 'boolean' },
      movie: { type: 'string' },
      viewerHost: { type: 'string' },
      viewerPort: { type: 'number' },
      blueprintsDir: { type: 'string' },
      defaultBlueprint: { type: 'string' },
      openViewer: { type: 'boolean' },
    },
  },
);

async function main(): Promise<void> {
  const [command, ...rest] = cli.input;
  const positionalInquiry = command === 'query' ? rest[0] : undefined;
  const remaining = positionalInquiry !== undefined ? rest.slice(1) : rest;
  const flags = cli.flags as {
    config?: string;
    rootFolder?: string;
    configPath?: string;
    movieId?: string;
    prompts?: boolean;
    inputs?: string;
      dryrun?: boolean;
      nonInteractive?: boolean;
      usingBlueprint?: string;
      concurrency?: number;
      interactiveEdit?: boolean;
      submitEdits?: boolean;
      movie?: string;
      viewerHost?: string;
      viewerPort?: number;
    blueprintsDir?: string;
    defaultBlueprint?: string;
    openViewer?: boolean;
  };

  switch (command) {
    case 'install':
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
      if (remaining.length > 0) {
        console.error('Error: query accepts at most one positional argument for the inquiry prompt.');
        process.exitCode = 1;
        return;
      }
      if (!flags.inputs) {
        console.error('Error: --inputs is required for query.');
        process.exitCode = 1;
        return;
      }
      if (!flags.usingBlueprint) {
        console.error('Error: --usingBlueprint is required for query.');
        process.exitCode = 1;
        return;
      }
      const result = await runQuery({
        inputsPath: flags.inputs,
        inquiryPrompt: positionalInquiry,
        dryRun: Boolean(flags.dryrun),
        nonInteractive: Boolean(flags.nonInteractive),
        usingBlueprint: flags.usingBlueprint,
        concurrency: flags.concurrency,
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
      if (!flags.usingBlueprint) {
        console.error('Error: --usingBlueprint is required for providers:list.');
        process.exitCode = 1;
        return;
      }
      const cliConfig = await readCliConfig();
      if (!cliConfig) {
        console.error('Tutopanda CLI is not initialized. Run "tutopanda init" first.');
        process.exitCode = 1;
        return;
      }
      const blueprintPath = await resolveBlueprintSpecifier(flags.usingBlueprint, {
        cliRoot: cliConfig.storage.root,
      });
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
      const cliConfig = await readCliConfig();
      const directory = cliConfig
        ? getCliBlueprintsRoot(cliConfig.storage.root)
        : getBundledBlueprintsRoot();
      const result = await runBlueprintsList(directory);

      if (result.blueprints.length === 0) {
        console.log('No blueprint YAML files found.');
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
        const cliConfig = await readCliConfig();
        const resolvedPath = await resolveBlueprintSpecifier(blueprintPath, {
          cliRoot: cliConfig?.storage.root,
        });
        const result = await runBlueprintsDescribe({ blueprintPath: resolvedPath });

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

      const cliConfig = await readCliConfig();
      const resolvedPath = await resolveBlueprintSpecifier(blueprintPath, {
        cliRoot: cliConfig?.storage.root,
      });
      const result = await runBlueprintsValidate({ blueprintPath: resolvedPath });

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
        concurrency: flags.concurrency,
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
        concurrency: flags.concurrency,
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
    case 'viewer:start': {
      await runViewerStart({
        host: flags.viewerHost,
        port: flags.viewerPort,
      });
      return;
    }
    case 'viewer:view': {
      await runViewerView({
        movieId: flags.movieId ?? flags.movie,
        host: flags.viewerHost,
        port: flags.viewerPort,
      });
      return;
    }
    case 'viewer:stop': {
      await runViewerStop();
      return;
    }
    case 'mcp': {
      await runMcpServer({
        configPath: flags.config,
        blueprintsDir: flags.blueprintsDir,
        defaultBlueprint: flags.defaultBlueprint,
        openViewer: flags.openViewer,
      });
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
  const layersLabel = summary.layers === 1 ? 'layer' : 'layers';
  const jobsLabel = summary.jobCount === 1 ? 'job' : 'jobs';
  console.log(
    `Dry run status: ${summary.status}. ${summary.layers} ${layersLabel}, ${summary.jobCount} ${jobsLabel} (succeeded ${counts.succeeded}, failed ${counts.failed}, skipped ${counts.skipped}).`,
  );

  const layerMap = buildLayerMap(summary.jobs);
  if (layerMap.size === 0) {
    console.log('Layer breakdown: no jobs scheduled.');
    console.log(`Mock artefacts and logs stored under: ${storagePath}`);
    return;
  }

  console.log('Layer breakdown:');
  const sortedLayers = Array.from(layerMap.entries()).sort((a, b) => a[0] - b[0]);
  for (const [layerIndex, jobs] of sortedLayers) {
    const layerCounts = { succeeded: 0, failed: 0, skipped: 0 };
    const producerCounts = new Map<string, number>();
    for (const job of jobs) {
      layerCounts[job.status] += 1;
      producerCounts.set(job.producer, (producerCounts.get(job.producer) ?? 0) + 1);
    }
    const statusParts = [
      layerCounts.succeeded ? `succeeded ${layerCounts.succeeded}` : undefined,
      layerCounts.failed ? `failed ${layerCounts.failed}` : undefined,
      layerCounts.skipped ? `skipped ${layerCounts.skipped}` : undefined,
    ].filter(Boolean);
    const statusText = statusParts.length > 0 ? ` (${statusParts.join(', ')})` : '';
    console.log(`  Layer ${layerIndex}: ${jobs.length} job(s)${statusText}`);
    const producerParts = Array.from(producerCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([producer, count]) => `${producer} ×${count}`);
    if (producerParts.length > 0) {
      console.log(`    Producers: ${producerParts.join(', ')}`);
    }
  }

  const failingJob = summary.jobs.find((job) => job.status === 'failed');
  if (failingJob) {
    console.log('First failure:');
    console.log(`  Layer ${failingJob.layerIndex} – ${failingJob.producer} (${failingJob.jobId})`);
    if (failingJob.errorMessage) {
      console.log(`  Error: ${failingJob.errorMessage}`);
    }
  }

  console.log(`Mock artefacts and logs stored under: ${storagePath}`);
}

function buildLayerMap(jobs: DryRunJobSummary[]): Map<number, DryRunJobSummary[]> {
  const map = new Map<number, DryRunJobSummary[]>();
  for (const job of jobs) {
    const bucket = map.get(job.layerIndex);
    if (bucket) {
      bucket.push(job);
    } else {
      map.set(job.layerIndex, [job]);
    }
  }
  return map;
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
