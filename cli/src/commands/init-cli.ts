import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import os from 'node:os';
import type { StorageLocationInput } from 'tutopanda-core';

export interface InitCliOptions {
  configPath?: string;
  storagePath?: string;
}

const DEFAULT_STORAGE_PATH = resolve(os.homedir(), '.tutopanda', 'builds');

export type CliConfig = {
  storage: StorageLocationInput;
};

export async function runInitCli(options: InitCliOptions = {}): Promise<{ configPath: string; storagePath: string }> {
  const targetPath = resolve(
    options.configPath ?? resolve(os.homedir(), '.tutopanda', 'config.json'),
  );

  const storagePath = resolve(options.storagePath ?? DEFAULT_STORAGE_PATH);

  await mkdir(dirname(targetPath), { recursive: true });
  await mkdir(storagePath, { recursive: true });

  const config: CliConfig = {
    storage: {
      root: storagePath,
    },
  };

  await writeFile(targetPath, JSON.stringify(config, null, 2), 'utf8');

  return { configPath: targetPath, storagePath };
}

export async function readCliConfig(configPath?: string): Promise<CliConfig | null> {
  const targetPath = resolve(
    configPath ?? resolve(os.homedir(), '.tutopanda', 'config.json'),
  );
  try {
    const raw = await readFile(targetPath, 'utf8');
    return JSON.parse(raw) as CliConfig;
  } catch (error) {
    return null;
  }
}
