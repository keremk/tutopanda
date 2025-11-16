import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  getDefaultCliConfigPath,
  getDefaultRoot,
  writeCliConfig,
  type CliConfig,
} from '../lib/cli-config.js';
import { expandPath } from '../lib/path.js';
import { copyBundledConfigAssets, getCliConfigRoot } from '../lib/config-assets.js';

export interface InitOptions {
  rootFolder?: string;
  configPath?: string;
}

export interface InitResult {
  rootFolder: string;
  buildsFolder: string;
  cliConfigPath: string;
}

export async function runInit(options: InitOptions = {}): Promise<InitResult> {
  const rootFolder = expandPath(options.rootFolder ?? getDefaultRoot());
  const buildsFolder = resolve(rootFolder, 'builds');
  const cliConfigPath = expandPath(options.configPath ?? getDefaultCliConfigPath());

  await mkdir(rootFolder, { recursive: true });
  await mkdir(buildsFolder, { recursive: true });
  await copyBundledConfigAssets(getCliConfigRoot(rootFolder));

  const cliConfig: CliConfig = {
    storage: {
      root: rootFolder,
      basePath: 'builds',
    },
  };
  await writeCliConfig(cliConfig, cliConfigPath);

  return {
    rootFolder,
    buildsFolder,
    cliConfigPath,
  };
}
