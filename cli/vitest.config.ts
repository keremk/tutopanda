import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      'tutopanda-core': new URL('../core/src/index.ts', import.meta.url).pathname,
    },
  },
});
