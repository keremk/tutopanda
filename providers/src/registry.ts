import type { ProducerKind } from 'tutopanda-core';
import { mockHandlerFactories } from './mappings.js';
import type {
  HandlerFactory,
  ProducerHandler,
  ProviderDescriptor,
  ProviderMode,
  ProviderRegistry,
  ProviderRegistryOptions,
} from './types.js';

export function createProviderRegistry(options: ProviderRegistryOptions = {}): ProviderRegistry {
  const mode: ProviderMode = options.mode ?? 'mock';

  return {
    mode,
    resolve(descriptor: ProviderDescriptor): ProducerHandler {
      if (mode === 'mock') {
        const factory = selectFactory(descriptor.kind);
        return factory(descriptor);
      }
      throw new Error(`Provider mode "${mode}" is not implemented yet.`);
    },
  };
}

function selectFactory(kind: ProducerKind): HandlerFactory {
  const factory = mockHandlerFactories[kind];
  if (!factory) {
    throw new Error(`No mock handler registered for producer kind "${kind}".`);
  }
  return factory;
}
