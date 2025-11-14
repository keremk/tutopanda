/* eslint-env node */
import process from 'node:process';
import './__testutils__/mock-providers.js';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from './init.js';
import { runQuery, formatMovieId } from './query.js';
import { readCliConfig } from '../lib/cli-config.js';
import { createInputsFile } from './__testutils__/inputs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_BLUEPRINT_PATH = resolve(__dirname, '../../blueprints/yaml/modules/script-generator.yaml');
const IMAGE_AUDIO_BLUEPRINT_PATH = resolve(__dirname, '../../blueprints/yaml/image-audio.yaml');

const tmpRoots: string[] = [];
const originalEnvConfig = process.env.TUTOPANDA_CLI_CONFIG;

afterEach(async () => {
  process.env.TUTOPANDA_CLI_CONFIG = originalEnvConfig;
  while (tmpRoots.length) {
    const dir = tmpRoots.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tutopanda-query-'));
  tmpRoots.push(dir);
  return dir;
}

describe('runQuery', () => {
  beforeEach(() => {
    process.env.TUTOPANDA_CLI_CONFIG = undefined;
  });

  it('generates a plan and writes prompt/config files', async () => {
    const root = await createTempRoot();
    const cliConfigPath = join(root, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = cliConfigPath;

    await runInit({ rootFolder: root, configPath: cliConfigPath });

    const inputsPath = await createInputsFile({ root, prompt: 'Tell me a story about the sea' });
    const result = await runQuery({
      inputsPath,
      nonInteractive: true,
      usingBlueprint: SCRIPT_BLUEPRINT_PATH,
    });

    expect(result.movieId).toHaveLength(8);
    expect(result.dryRun).toBeUndefined();

    const cliConfig = await readCliConfig(cliConfigPath);
    expect(cliConfig).not.toBeNull();

    const storageMovieId = formatMovieId(result.movieId);
    const movieDir = resolve(cliConfig!.storage.root, cliConfig!.storage.basePath, storageMovieId);

    const planStats = await stat(join(movieDir, 'runs', `${result.targetRevision}-plan.json`));
    expect(planStats.isFile()).toBe(true);
    const plan = JSON.parse(
      await readFile(join(movieDir, 'runs', `${result.targetRevision}-plan.json`), 'utf8'),
    );
    const firstJob = plan.layers.flat()[0];
    expect(firstJob.context.inputBindings.InquiryPrompt).toBe('Input:InquiryPrompt');
    expect(firstJob.context.inputs).toContain('Input:InquiryPrompt');
    expect(firstJob.context.produces.some((id: string) => id.startsWith('Artifact:NarrationScript'))).toBe(true);

    const prompt = await readFile(join(movieDir, 'prompts', 'inquiry.txt'), 'utf8');
    expect(prompt.trim()).toBe('Tell me a story about the sea');

    expect(result.build?.status).toBe('succeeded');
    expect(result.manifestPath).toBeDefined();
    const manifestStats = await stat(result.manifestPath!);
    expect(manifestStats.isFile()).toBe(true);

    const current = JSON.parse(
      await readFile(join(movieDir, 'current.json'), 'utf8'),
    ) as { revision?: string };
    expect(current.revision).toBe(result.targetRevision);
  });

  it('can perform a dry run and report summary', async () => {
    const root = await createTempRoot();
    const cliConfigPath = join(root, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = cliConfigPath;

    await runInit({ rootFolder: root, configPath: cliConfigPath });

    const inputsPath = await createInputsFile({ root, prompt: 'Explain gravity' });
    const result = await runQuery({
      inputsPath,
      dryRun: true,
      nonInteractive: true,
      usingBlueprint: SCRIPT_BLUEPRINT_PATH,
    });

    expect(result.dryRun).toBeDefined();
    expect(result.dryRun?.status).toBe('succeeded');
    expect(result.dryRun?.jobCount).toBeGreaterThan(0);
    expect(result.dryRun?.statusCounts.succeeded).toBeGreaterThan(0);
    expect(result.build).toBeUndefined();
  });

  it('runs the image + audio blueprint with timeline stub', async () => {
    const root = await createTempRoot();
    const cliConfigPath = join(root, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = cliConfigPath;

    await runInit({ rootFolder: root, configPath: cliConfigPath });

    const inputsPath = await createInputsFile({
      root,
      prompt: 'History of comets',
      overrides: {
        VoiceId: 'timeline-voice',
        NumOfSegments: 2,
        NumOfImagesPerNarrative: 2,
      },
    });
    const result = await runQuery({
      inputsPath,
      nonInteractive: true,
      usingBlueprint: IMAGE_AUDIO_BLUEPRINT_PATH,
    });

    expect(result.build?.status).toBe('succeeded');
    expect(result.manifestPath).toBeDefined();
  });

  it('schedules TimelineProducer after upstream image/audio jobs', async () => {
    const root = await createTempRoot();
    const cliConfigPath = join(root, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = cliConfigPath;

    await runInit({ rootFolder: root, configPath: cliConfigPath });

    const inputsPath = await createInputsFile({
      root,
      prompt: 'Formation of galaxies',
      overrides: {
        VoiceId: 'timeline-voice',
        NumOfSegments: 2,
        NumOfImagesPerNarrative: 2,
      },
    });
    const result = await runQuery({
      inputsPath,
      dryRun: true,
      nonInteractive: true,
      usingBlueprint: IMAGE_AUDIO_BLUEPRINT_PATH,
    });

    expect(result.dryRun).toBeDefined();
    const jobs = result.dryRun?.jobs ?? [];
    const timelineJob = jobs.find((job) =>
      job.jobId.includes('TimelineComposer.TimelineProducer') || job.producer === 'TimelineProducer',
    );
    expect(timelineJob).toBeDefined();
    const maxLayer = Math.max(...jobs.map((job) => job.layerIndex));
    expect(timelineJob?.layerIndex).toBe(maxLayer);
  });
});
