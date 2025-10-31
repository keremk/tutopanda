import type { ProducerKind } from 'tutopanda-core';
import { createMockArtefacts } from './mock-output.js';
import type {
  HandlerFactory,
  ProducerHandler,
  ProviderDescriptor,
  ProviderJobContext,
  ProviderResult,
} from './types.js';

export function createMockProducerHandler(kind: ProducerKind): HandlerFactory {
  return (descriptor: ProviderDescriptor): ProducerHandler => ({
    kind,
    provider: descriptor.provider,
    model: descriptor.model,
    mode: 'mock',
    async invoke(request: ProviderJobContext): Promise<ProviderResult> {
      const artefacts = createMockArtefacts(request);
      return {
        status: 'succeeded',
        artefacts,
      };
    },
  });
}
