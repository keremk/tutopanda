import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Force thread pool so Vitest reports failures correctly under Codex harness
    pool: 'threads',
    name: 'unit',
    include: [
      'src/**/*.{test,spec}.ts',
      'src/**/__tests__/**/*.{test,spec}.ts',
      'src/**/*.{unit.test,unit.spec}.ts',
    ],
    exclude: [
      'node_modules',
      'tests/integration',
      '**/*.int.test.ts',
    ],
    environment: 'node',
    globals: true,
  },
});
