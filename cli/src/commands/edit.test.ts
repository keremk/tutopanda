/* eslint-env node */
import process from 'node:process';
import './__testutils__/mock-providers.js';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from './init.js';
import { runQuery, formatMovieId } from './query.js';
import { runEdit } from './edit.js';
import { createInputsFile } from './__testutils__/inputs.js';
import { getBundledBlueprintsRoot } from '../lib/config-assets.js';

const SCRIPT_BLUEPRINT_PATH = resolve(
  getBundledBlueprintsRoot(),
  'modules/script-generator.yaml',
);

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
  const dir = await mkdtemp(join(tmpdir(), 'tutopanda-edit-'));
  tmpRoots.push(dir);
  return dir;
}

async function createInputsFixture(root: string, prompt: string, fileName: string, overrides?: Record<string, string | number>): Promise<string> {
  return createInputsFile({ root, prompt, fileName, overrides });
}

describe('runEdit', () => {
  beforeEach(() => {
    process.env.TUTOPANDA_CLI_CONFIG = undefined;
  });

  it('updates prompts and generates a new plan revision', async () => {
    const root = await createTempRoot();
    const cliConfigPath = join(root, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = cliConfigPath;

    await runInit({ rootFolder: root, configPath: cliConfigPath });
    const queryInputsPath = await createInputsFixture(root, 'Describe the planets', 'query-inputs.yaml');
    const queryResult = await runQuery({
      inputsPath: queryInputsPath,
      nonInteractive: true,
      usingBlueprint: SCRIPT_BLUEPRINT_PATH,
    });

    const editInputsPath = await createInputsFixture(root, 'Tell me about stars', 'edit-inputs.yaml');

    const editResult = await runEdit({
      movieId: queryResult.movieId,
      inputsPath: editInputsPath,
      nonInteractive: true,
      usingBlueprint: SCRIPT_BLUEPRINT_PATH,
    });

    expect(editResult.targetRevision).toBe('rev-0002');
    expect(editResult.dryRun).toBeUndefined();
    expect(editResult.build?.status).toBe('succeeded');
    expect(editResult.manifestPath).toBeDefined();
    const manifestStats = await stat(editResult.manifestPath!);
    expect(manifestStats.isFile()).toBe(true);

    const cliConfig = JSON.parse(await readFile(cliConfigPath, 'utf8')) as {
      storage: { root: string; basePath: string };
      defaultSettingsPath: string;
    };
    const storageMovieId = formatMovieId(queryResult.movieId);
    const inquiryPath = resolve(cliConfig.storage.root, cliConfig.storage.basePath, storageMovieId, 'prompts', 'inquiry.txt');
    const inquiryContents = await readFile(inquiryPath, 'utf8');
    expect(inquiryContents.trim()).toBe('Tell me about stars');
  });

  it('supports dry run mode', async () => {
    const root = await createTempRoot();
    const cliConfigPath = join(root, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = cliConfigPath;

    await runInit({ rootFolder: root, configPath: cliConfigPath });
    const queryInputsPath = await createInputsFixture(root, 'Describe oceans', 'query-inputs.yaml');
    const queryResult = await runQuery({
      inputsPath: queryInputsPath,
      nonInteractive: true,
      usingBlueprint: SCRIPT_BLUEPRINT_PATH,
    });

    const editInputsPath = await createInputsFixture(root, 'Describe oceans with drama', 'edit-inputs.yaml', {
      ImageStyle: 'storybook',
    });

    const editResult = await runEdit({
      movieId: queryResult.movieId,
      dryRun: true,
      inputsPath: editInputsPath,
      usingBlueprint: SCRIPT_BLUEPRINT_PATH,
    });

    expect(editResult.dryRun).toBeDefined();
    expect(editResult.dryRun?.jobCount).toBeGreaterThan(0);
    expect(editResult.dryRun?.statusCounts.succeeded).toBeGreaterThan(0);
    expect(editResult.build).toBeUndefined();
  });
});
