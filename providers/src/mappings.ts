import type { ProducerKind } from 'tutopanda-core';
import { createMockProducerHandler } from './mock-producers.js';
import { producerCatalog } from './catalog.js';
import type { HandlerFactory } from './types.js';

export const mockHandlerFactories: Record<ProducerKind, HandlerFactory> = Object.fromEntries(
  Object.keys(producerCatalog).map((kind) => {
    const typedKind = kind as ProducerKind;
    return [typedKind, createMockProducerHandler(typedKind)];
  }),
) as Record<ProducerKind, HandlerFactory>;
