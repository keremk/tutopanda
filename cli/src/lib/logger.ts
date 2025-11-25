import { createLogger, type Logger } from '@tutopanda/core';

export interface CliLoggerOptions {
  verbose?: boolean;
  prefix?: string;
}

export type CliLogger = Logger;

export function createCliLogger(options: CliLoggerOptions = {}): CliLogger {
  return createLogger({
    level: options.verbose ? 'debug' : 'info',
    prefix: options.prefix,
  });
}
