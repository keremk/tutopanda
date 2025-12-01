/* eslint-disable no-unused-vars */
import { createWriteStream, type WriteStream } from 'node:fs';
import { dirname } from 'node:path';
import { mkdirSync } from 'node:fs';
import {
  createLogger,
  type LogEvent,
  type Logger,
  type LogLevel,
  type LogWriter,
} from '@tutopanda/core';

export type CliLoggerMode = 'tui' | 'log';

export interface CliLoggerOptions {
  mode: CliLoggerMode;
  level: LogLevel;
  prefix?: string;
  logFilePath?: string;
  onLogEvent?: (logEvent: LogEvent) => void;
}

export type CliLogger = Logger;

export function createCliLogger(options: CliLoggerOptions): CliLogger {
  const isTest =
    process.env.VITEST === 'true' ||
    process.env.VITEST_WORKER_ID !== undefined ||
    process.env.NODE_ENV === 'test';
  const writers: Partial<Record<keyof Logger, LogWriter>> =
    options.mode === 'log' && !isTest
      ? {
          info: globalThis.console.log.bind(globalThis.console),
          warn: globalThis.console.warn.bind(globalThis.console),
          error: globalThis.console.error.bind(globalThis.console),
          debug: globalThis.console.debug.bind(globalThis.console),
        }
      : {
          // Suppress all stdout/stderr logging in TUI or tests; notifications handle user output.
          info: () => {},
          warn: () => {},
          error: () => {},
          debug: () => {},
        };

  const fileWriter = options.logFilePath ? createJsonlWriter(options.logFilePath) : undefined;

  return createLogger({
    level: options.level,
    prefix: options.prefix,
    writers,
    onLog(logEvent) {
      options.onLogEvent?.(logEvent);
      fileWriter?.(logEvent);
    },
  });
}

export function createJsonlWriter(logFilePath: string): (event: LogEvent) => void {
  mkdirSync(dirname(logFilePath), { recursive: true });
  const stream: WriteStream = createWriteStream(logFilePath, { flags: 'a' });

  return (logEvent: LogEvent): void => {
    const payload = JSON.stringify(logEvent);
    stream.write(payload.endsWith('\n') ? payload : `${payload}\n`);
  };
}
