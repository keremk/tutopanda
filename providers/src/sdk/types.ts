import type {
  ProducerHandler,
  ProviderJobContext,
  ProviderResult,
  ProviderAttachment,
  ProviderDescriptor,
  ProviderLogger,
} from '../types.js';
import type { BlueprintProducerSdkMappingField } from '@tutopanda/core';

export type ProducerDomain = 'prompt' | 'media';

export interface ProducerExtras {
  plannerContext?: Record<string, unknown>;
  resolvedInputs?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ProducerInvokeArgs {
  request: ProviderJobContext;
  runtime: ProducerRuntime;
}

export type ProducerInvokeFn = (args: ProducerInvokeArgs) => Promise<ProviderResult>;

export interface ProducerWarmStartArgs {
  handler: ProducerHandler;
  logger?: ProviderLogger;
}

export type ProducerWarmStartFn = (args: ProducerWarmStartArgs) => Promise<void>;

export interface ProducerRuntimeConfig {
  raw: unknown;
  parse<T = unknown>(schema?: (value: unknown) => T): T;
}

export interface AttachmentReader {
  all(): ProviderAttachment[];
  find(name: string): ProviderAttachment | undefined;
  text(name: string): string | undefined;
}

export interface ResolvedInputsAccessor {
  all(): Record<string, unknown>;
  get<T = unknown>(key: string): T | undefined;
  getByNodeId<T = unknown>(canonicalId: string): T | undefined;
}

export interface RuntimeSdkHelpers {
  buildPayload(
    sdkMapping?: Record<string, BlueprintProducerSdkMappingField>,
  ): Record<string, unknown>;
}

export interface ArtefactRegistry {
  expectInline(artefactId: string): string;
  expectBlob(artefactId: string): string;
}

export interface ProducerRuntime {
  descriptor: ProviderDescriptor;
  domain: ProducerDomain;
  config: ProducerRuntimeConfig;
  attachments: AttachmentReader;
  inputs: ResolvedInputsAccessor;
  sdk: RuntimeSdkHelpers;
  artefacts: ArtefactRegistry;
  logger?: ProviderLogger;
}
