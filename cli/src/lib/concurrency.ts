import {
  DEFAULT_CONCURRENCY,
  getDefaultCliConfigPath,
  normalizeConcurrency,
  writeCliConfig,
  type CliConfig,
} from './cli-config.js';

interface ResolveConcurrencyOptions {
  override?: number;
  configPath?: string;
}

export async function resolveAndPersistConcurrency(
  cliConfig: CliConfig,
  options: ResolveConcurrencyOptions = {},
): Promise<{ concurrency: number; cliConfig: CliConfig }> {
  const targetPath = options.configPath ?? getDefaultCliConfigPath();
  const hasOverride = options.override !== undefined;
  const concurrency = normalizeConcurrency(
    hasOverride ? options.override : cliConfig.concurrency ?? DEFAULT_CONCURRENCY,
  );

  const shouldPersist =
    hasOverride
    || cliConfig.concurrency === undefined
    || cliConfig.concurrency !== concurrency;

  if (shouldPersist) {
    const updated = { ...cliConfig, concurrency };
    await writeCliConfig(updated, targetPath);
    return { concurrency, cliConfig: updated };
  }

  return { concurrency, cliConfig };
}
