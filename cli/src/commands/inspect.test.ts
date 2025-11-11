/* eslint-env node */
import process from 'node:process';
import './__testutils__/mock-providers.js';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runInit } from './init.js';
import { runQuery } from './query.js';
import { runInspect } from './inspect.js';
import { createInputsFile } from './__testutils__/inputs.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCRIPT_BLUEPRINT_PATH = resolve(__dirname, '../../blueprints/script-generate.toml');

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
  const dir = await mkdtemp(join(tmpdir(), 'tutopanda-inspect-'));
  tmpRoots.push(dir);
  return dir;
}

describe('runInspect', () => {
  beforeEach(() => {
    process.env.TUTOPANDA_CLI_CONFIG = undefined;
  });

  it('returns prompts in TOML format', async () => {
    const root = await createTempRoot();
    const cliConfigPath = join(root, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = cliConfigPath;

    await runInit({ rootFolder: root, configPath: cliConfigPath });
    const inputsPath = await createInputsFile({
      root,
      prompt: 'Describe the solar system',
      fileName: 'query-inputs.toml',
    });
    const queryResult = await runQuery({
      inputsPath,
      nonInteractive: true,
      usingBlueprint: SCRIPT_BLUEPRINT_PATH,
    });

    const inspectResult = await runInspect({ movieId: queryResult.movieId, prompts: true });
    expect(inspectResult.promptsToml).toBeDefined();
    expect(inspectResult.promptsToml).toContain('Describe the solar system');
  });
});
