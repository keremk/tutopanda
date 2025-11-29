import type {
  HandlerFactory,
  HandlerFactoryInit,
  ProducerHandler,
  ProviderResult,
} from '../types.js';
import { createProducerRuntime } from './runtime.js';
import type {
  ProducerDomain,
  ProducerInvokeFn,
  ProducerWarmStartFn,
} from './types.js';

export interface CreateProducerHandlerFactoryOptions {
  domain: ProducerDomain;
  invoke: ProducerInvokeFn;
  configValidator?: (value: unknown) => unknown;
  warmStart?: ProducerWarmStartFn;
}

export function createProducerHandlerFactory(
  options: CreateProducerHandlerFactoryOptions,
): HandlerFactory {
  return (init: HandlerFactoryInit): ProducerHandler => {
    const { descriptor } = init;
    const handler: ProducerHandler = {
      provider: descriptor.provider,
      model: descriptor.model,
      environment: descriptor.environment,
      mode: init.mode,
      warmStart: options.warmStart
        ? async (context) => {
            await options.warmStart?.({
              handler,
              logger: context.logger ?? init.logger,
            });
          }
        : undefined,
      async invoke(request): Promise<ProviderResult> {
        const runtime = createProducerRuntime({
          descriptor,
          domain: options.domain,
          request,
          logger: init.logger,
          configValidator: options.configValidator,
          mode: init.mode,
        });
        return options.invoke({
          request,
          runtime,
        });
      },
    };
    return handler;
  };
}
