import { defineConfig } from 'vitest/config';
import { config } from 'dotenv';

config();

export default defineConfig({
  test: {
    name: 'integration',
    include: [
      'tests/integration/**/*.int.test.ts',
      '**/*.int.test.ts',
    ],
    exclude: ['node_modules'],
    environment: 'node',
    globals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
