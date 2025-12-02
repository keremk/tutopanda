import type { Logger } from '@tutopanda/core';

const isDebugOutputEnabled = process.env.TEST_DEBUG_OUTPUT === 'true';

export function createTestLogger(): Logger {
  if (isDebugOutputEnabled) {
    return globalThis.console;
  }
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
}
