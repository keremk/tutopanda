/* eslint-disable no-unused-vars */
export type LogLevel = 'info' | 'debug';

export type LogMeta = Record<string, unknown>;

export type LogWriter = (_message: string, _meta?: LogMeta) => void;

export interface LogEvent {
  level: keyof Logger;
  message: string;
  meta?: LogMeta;
  timestamp: string;
  prefix?: string;
}

export interface Logger {
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  debug(message: string, meta?: LogMeta): void;
}

export interface CreateLoggerOptions {
  level?: LogLevel;
  writers?: Partial<Record<keyof Logger, LogWriter>>;
  prefix?: string;
  onLog?: (event: LogEvent) => void;
}

export function createLogger(options: CreateLoggerOptions = {}): Logger {
  const level: LogLevel = options.level ?? 'info';
  const prefix = options.prefix?.trim();
  const consoleRef = globalThis.console;

  const writers: Record<keyof Logger, LogWriter | undefined> = {
    info: options.writers?.info ?? consoleRef.log.bind(consoleRef),
    warn: options.writers?.warn ?? consoleRef.warn.bind(consoleRef),
    error: options.writers?.error ?? consoleRef.error.bind(consoleRef),
    debug: options.writers?.debug ?? consoleRef.debug.bind(consoleRef),
  };

  const formatMessage = (message: string): string =>
    prefix ? `${prefix} ${message}` : message;

  const shouldLog = (targetLevel: keyof Logger): boolean => {
    if (targetLevel === 'debug') {
      return level === 'debug';
    }
    return true;
  };

  const emit = (target: keyof Logger, message: string, meta?: LogMeta): void => {
    if (!shouldLog(target)) {
      return;
    }

    const event: LogEvent = {
      level: target,
      message,
      meta,
      timestamp: new Date().toISOString(),
      prefix,
    };
    options.onLog?.(event);

    const output = writers[target];
    if (!output) {
      return;
    }
    if (meta && Object.keys(meta).length > 0) {
      output(formatMessage(message), meta);
      return;
    }
    output(formatMessage(message));
  };

  return {
    info(message, meta) {
      emit('info', message, meta);
    },
    warn(message, meta) {
      emit('warn', message, meta);
    },
    error(message, meta) {
      emit('error', message, meta);
    },
    debug(message, meta) {
      emit('debug', message, meta);
    },
  };
}
/* eslint-disable no-unused-vars */
