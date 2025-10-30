import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runInitCli, readCliConfig } from './init-cli.js';

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

describe('runInitCli', () => {
  it('writes config file and creates storage directory', async () => {
    const root = await createTempRoot();
    const configPath = join(root, 'config.json');
    const storagePath = join(root, 'storage');

    const result = await runInitCli({ configPath, storagePath });

    expect(result.configPath).toBe(configPath);
    expect(result.storagePath).toBe(storagePath);

    const contents = JSON.parse(await readFile(configPath, 'utf8'));
    expect(contents.storage.root).toBe(storagePath);
  });
});

describe('readCliConfig', () => {
  it('returns null when file is missing', async () => {
    const root = await createTempRoot();
    const config = await readCliConfig(join(root, 'missing.json'));
    expect(config).toBeNull();
  });
});
