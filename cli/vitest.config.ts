import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: [
      {
        find: '@tutopanda/core',
        replacement: new URL('../core/src/index.ts', import.meta.url).pathname,
      },
      {
        find: '@tutopanda/providers',
        replacement: new URL('../providers/src/index.ts', import.meta.url).pathname,
      },
    ],
  },
});
