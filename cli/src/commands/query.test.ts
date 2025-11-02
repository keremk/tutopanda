/* eslint-env node */
import process from 'node:process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from './init.js';
import { runQuery, formatMovieId } from './query.js';
import { readCliConfig } from '../lib/cli-config.js';

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

    const result = await runQuery({ prompt: 'Tell me a story about the sea' });

    expect(result.movieId).toHaveLength(8);
    expect(result.dryRun).toBeUndefined();

    const cliConfig = await readCliConfig(cliConfigPath);
    expect(cliConfig).not.toBeNull();

    const storageMovieId = formatMovieId(result.movieId);
    const movieDir = resolve(cliConfig!.storage.root, cliConfig!.storage.basePath, storageMovieId);

    const planStats = await stat(join(movieDir, 'runs', `${result.targetRevision}-plan.json`));
    expect(planStats.isFile()).toBe(true);

    const prompt = await readFile(join(movieDir, 'prompts', 'inquiry.txt'), 'utf8');
    expect(prompt.trim()).toBe('Tell me a story about the sea');

    const providersConfig = JSON.parse(await readFile(join(movieDir, 'providers.json'), 'utf8'));
    expect(providersConfig.ScriptProducer).toBeDefined();

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

    const result = await runQuery({ prompt: 'Explain gravity', dryRun: true });

    expect(result.dryRun).toBeDefined();
    expect(result.dryRun?.status).toBe('succeeded');
    expect(result.dryRun?.jobCount).toBeGreaterThan(0);
    expect(result.dryRun?.statusCounts.succeeded).toBeGreaterThan(0);
    expect(result.build).toBeUndefined();
  });
});
