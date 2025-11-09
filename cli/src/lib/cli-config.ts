/* eslint-env node */
import process from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import { dirname, resolve } from 'node:path';

export interface CliConfig {
  storage: {
    root: string;
    basePath: string;
  };
}

const DEFAULT_ROOT = resolve(os.homedir(), '.tutopanda');
export function getDefaultCliConfigPath(): string {
  const envPath = process.env.TUTOPANDA_CLI_CONFIG;
  if (envPath) {
    return resolve(envPath);
  }
  return resolve(DEFAULT_ROOT, 'cli-config.json');
}

export async function readCliConfig(configPath?: string): Promise<CliConfig | null> {
  const targetPath = resolve(configPath ?? getDefaultCliConfigPath());
  try {
    const contents = await readFile(targetPath, 'utf8');
    const parsed = JSON.parse(contents) as Partial<CliConfig>;
    if (!parsed.storage) {
      return null;
    }
    return {
      storage: parsed.storage,
    };
  } catch {
    return null;
  }
}

export async function writeCliConfig(config: CliConfig, configPath?: string): Promise<string> {
  const targetPath = resolve(configPath ?? getDefaultCliConfigPath());
  await mkdir(dirname(targetPath), { recursive: true });
  await writeFile(targetPath, JSON.stringify(config, null, 2), 'utf8');
  return targetPath;
}

export function getDefaultRoot(): string {
  return DEFAULT_ROOT;
}
