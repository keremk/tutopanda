import { createMockProducerHandler } from './mock-producers.js';
import { createOpenAiLlmHandler } from './producers/llm/openai.js';
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
  {
    match: {
      provider: 'openai',
      model: wildcard,
      environment: wildcard,
    },
    mode: 'live',
    factory: createOpenAiLlmHandler(),
  },
];
