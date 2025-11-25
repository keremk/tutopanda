import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: [
      {
        find: '@tutopanda/core/blueprint-loader',
        replacement: new URL('../core/src/blueprint-loader/index.ts', import.meta.url).pathname,
      },
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
