import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runInit } from './init.js';
import { readCliConfig } from '../lib/cli-config.js';

const tmpRoots: string[] = [];

afterEach(async () => {
  while (tmpRoots.length) {
    const dir = tmpRoots.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tutopanda-init-'));
  tmpRoots.push(dir);
  return dir;
}

describe('runInit', () => {
  it('creates builds folder, default settings file, config files, and CLI config', async () => {
    const root = await createTempRoot();
    const configPath = resolve(root, 'cli-config.json');
    const result = await runInit({ rootFolder: root, configPath });

    const buildsStats = await stat(result.buildsFolder);
    expect(buildsStats.isDirectory()).toBe(true);

    const cliConfig = await readCliConfig(result.cliConfigPath);
    expect(cliConfig?.storage.root).toBe(result.rootFolder);
    expect(cliConfig?.storage.basePath).toBe('builds');
  });
});
