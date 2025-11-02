import { mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import {
  getDefaultCliConfigPath,
  getDefaultRoot,
  getDefaultSettingsPath,
  writeCliConfig,
  type CliConfig,
} from '../lib/cli-config.js';
import { writeDefaultSettings } from '../lib/provider-settings.js';
import { expandPath } from '../lib/path.js';

export interface InitOptions {
  rootFolder?: string;
  defaultSettings?: string;
  configPath?: string;
}

export interface InitResult {
  rootFolder: string;
  buildsFolder: string;
  cliConfigPath: string;
  defaultSettingsPath: string;
}

export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const rootFolder = expandPath(options.rootFolder ?? getDefaultRoot());
  const buildsFolder = resolve(rootFolder, 'builds');
  const defaultSettingsPath = expandPath(options.defaultSettings ?? getDefaultSettingsPath(rootFolder));
  const cliConfigPath = expandPath(options.configPath ?? getDefaultCliConfigPath());

  await mkdir(rootFolder, { recursive: true });
  await mkdir(buildsFolder, { recursive: true });
  await mkdir(dirname(defaultSettingsPath), { recursive: true });

  await writeDefaultSettings(defaultSettingsPath);

  const cliConfig: CliConfig = {
    storage: {
      root: rootFolder,
      basePath: 'builds',
    },
    defaultSettingsPath,
  };
  await writeCliConfig(cliConfig, cliConfigPath);

  return {
    rootFolder,
    buildsFolder,
    cliConfigPath,
    defaultSettingsPath,
  };
}
