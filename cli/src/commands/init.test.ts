import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
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
    const result = await runInit({ rootFolder: root });

    const buildsStats = await stat(result.buildsFolder);
    expect(buildsStats.isDirectory()).toBe(true);

    const defaultSettings = JSON.parse(await readFile(result.defaultSettingsPath, 'utf8')) as {
      general: Record<string, unknown>;
      producers: unknown[];
    };
    expect(defaultSettings.general).toBeDefined();
    expect(defaultSettings.general.useVideo).toBe(false);
    expect(Array.isArray(defaultSettings.producers)).toBe(true);

    const settingsDir = resolve(result.defaultSettingsPath, '..');
    const scriptConfig = await readFile(join(settingsDir, 'script-producer.toml'), 'utf8');
    expect(scriptConfig).toContain('system_prompt');

    const cliConfig = await readCliConfig(result.cliConfigPath);
    expect(cliConfig?.storage.root).toBe(result.rootFolder);
    expect(cliConfig?.storage.basePath).toBe('builds');
    expect(cliConfig?.defaultSettingsPath).toBe(result.defaultSettingsPath);
  });
});
