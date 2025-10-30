import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createDefaultProjectConfig, parseProjectConfig } from 'tutopanda-core';
import {
  getDefaultCliConfigPath,
  getDefaultRoot,
  getDefaultSettingsPath,
  writeCliConfig,
  type CliConfig,
} from '../lib/cli-config.js';

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
  const rootFolder = resolve(options.rootFolder ?? getDefaultRoot());
  const buildsFolder = resolve(rootFolder, 'builds');
  const defaultSettingsPath = resolve(options.defaultSettings ?? getDefaultSettingsPath(rootFolder));
  const cliConfigPath = resolve(options.configPath ?? getDefaultCliConfigPath());

  await mkdir(buildsFolder, { recursive: true });

  const defaultConfig = createInitialProjectConfig();
  await writeFile(defaultSettingsPath, JSON.stringify(defaultConfig, null, 2), 'utf8');

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

function createInitialProjectConfig() {
  const config = createDefaultProjectConfig();
  const enriched = {
    ...config,
    General: {
      ...config.General,
      UseVideo: false,
      Audience: 'general',
      AudiencePrompt: '',
      Language: 'en',
      Duration: 60,
      AspectRatio: '16:9',
      Size: '480p',
      Style: 'Ghibli',
      CustomStyle: '',
    },
    Audio: {
      ...config.Audio,
      Voice: 'Atlas',
      Emotion: 'dramatic',
    },
    Music: {
      ...config.Music,
      Prompt: '',
    },
    Image: {
      ...config.Image,
      Format: 'PNG',
      ImagesPerSegment: 2,
    },
    Video: {
      ...config.Video,
      IsImageToVideo: false,
      ImageToVideo: {},
      AssemblyStrategy: 'speed-adjustment',
      SegmentAnimations: {},
    },
  };
  return parseProjectConfig(enriched);
}
