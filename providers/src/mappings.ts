import { createMockProducerHandler } from './mock-producers.js';
import type { ProviderImplementationRegistry } from './types.js';

const wildcard = '*' as const;

export const providerImplementations: ProviderImplementationRegistry = [
  {
    match: {
      provider: wildcard,
      model: wildcard,
      environment: wildcard,
    },
    mode: 'mock',
    factory: createMockProducerHandler(),
  },
];
