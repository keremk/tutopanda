/* eslint-env node */
import process from 'node:process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from './init.js';
import { runQuery, formatMovieId } from './query.js';
import { runEdit } from './edit.js';

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

describe('runEdit', () => {
  beforeEach(() => {
    process.env.TUTOPANDA_CLI_CONFIG = undefined;
  });

  it('updates prompts and generates a new plan revision', async () => {
    const root = await createTempRoot();
    const cliConfigPath = join(root, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = cliConfigPath;

    await runInit({ rootFolder: root, configPath: cliConfigPath });
    const queryResult = await runQuery({ prompt: 'Describe the planets' });

    const promptTomlPath = join(root, 'edit-prompts.toml');
    await writeFile(promptTomlPath, ' [prompts]\n inquiry = "Tell me about stars"\n', 'utf8');

    const editResult = await runEdit({ movieId: queryResult.movieId, inputsPath: promptTomlPath });

    expect(editResult.targetRevision).toBe('rev-0002');

    const cliConfig = JSON.parse(await readFile(cliConfigPath, 'utf8')) as {
      storage: { root: string; basePath: string };
      defaultSettingsPath: string;
    };
    const storageMovieId = formatMovieId(queryResult.movieId);
    const inquiryPath = resolve(cliConfig.storage.root, cliConfig.storage.basePath, storageMovieId, 'prompts', 'inquiry.txt');
    const inquiryContents = await readFile(inquiryPath, 'utf8');
    expect(inquiryContents.trim()).toBe('Tell me about stars');
  });
});
