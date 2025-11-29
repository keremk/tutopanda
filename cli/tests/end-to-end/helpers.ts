import { mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify, parse } from 'yaml';
import type { Logger } from '@tutopanda/core';
import { writeCliConfig, type CliConfig } from '../../src/lib/cli-config.js';

export interface LoggerRecorder {
  logger: Logger;
  warnings: unknown[];
  errors: unknown[];
}

export interface TempCliConfig {
  tempRoot: string;
  tempConfigPath: string;
  restoreEnv: () => void;
}

export interface InputsOverride {
  inputs?: Record<string, unknown>;
  models?: unknown[];
}

export function buildTempConfig(root: string): CliConfig {
  return {
    storage: {
      root,
      basePath: 'builds',
    },
    concurrency: 1,
  };
}

export async function setupTempCliConfig(): Promise<TempCliConfig> {
  const originalConfigEnv = process.env.TUTOPANDA_CLI_CONFIG;
  const tempRoot = await mkdtemp(join(tmpdir(), 'tutopanda-e2e-'));
  const tempConfigPath = join(tempRoot, 'cli-config.json');
  await writeCliConfig(buildTempConfig(tempRoot), tempConfigPath);
  process.env.TUTOPANDA_CLI_CONFIG = tempConfigPath;

  return {
    tempRoot,
    tempConfigPath,
    restoreEnv: () => {
      if (originalConfigEnv === undefined) {
        delete process.env.TUTOPANDA_CLI_CONFIG;
        return;
      }
      process.env.TUTOPANDA_CLI_CONFIG = originalConfigEnv;
    },
  };
}

export function createLoggerRecorder(): LoggerRecorder {
  const warnings: unknown[] = [];
  const errors: unknown[] = [];
  return {
    warnings,
    errors,
    logger: {
      debug: () => {},
      info: () => {},
      warn: (message: unknown) => {
        warnings.push(message);
      },
      error: (message: unknown) => {
        errors.push(message);
      },
    },
  };
}

export function expectFileExists(path: string): Promise<void> {
  return stat(path).then(() => {});
}

export async function readPlan(planPath: string): Promise<any> {
  const contents = await readFile(planPath, 'utf8');
  return JSON.parse(contents);
}

export function findJob(plan: any, producer: string) {
  return plan.layers.flat().find((job: any) => job.producer === producer);
}

export async function writeInputsFile(
  baseInputsPath: string,
  targetPath: string,
  overrides: InputsOverride = {},
): Promise<void> {
  const raw = await readFile(baseInputsPath, 'utf8');
  const parsed = parse(raw);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Base inputs YAML must contain a root mapping.');
  }
  const inputs = (parsed as Record<string, unknown>)['inputs'];
  if (!inputs || typeof inputs !== 'object' || Array.isArray(inputs)) {
    throw new Error('Base inputs YAML must include an "inputs" mapping.');
  }
  const mergedInputs = overrides.inputs
    ? { ...(inputs as Record<string, unknown>), ...overrides.inputs }
    : { ...(inputs as Record<string, unknown>) };

  const merged = { ...(parsed as Record<string, unknown>), inputs: mergedInputs };
  if ('models' in overrides) {
    merged.models = overrides.models;
  }

  const serialized = stringify(merged);
  await writeFile(targetPath, serialized, 'utf8');
}
