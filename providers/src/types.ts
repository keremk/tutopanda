import type {
  ArtefactEventStatus,
  ProducedArtefact,
  ProducerKind,
  ProviderName,
  RevisionId,
} from 'tutopanda-core';

export type ProviderMode = 'mock' | 'live';

export interface ProviderDescriptor {
  kind: ProducerKind;
  provider: ProviderName;
  model: string;
}

export interface ProviderJobContext {
  jobId: string;
  producer: ProducerKind;
  provider: ProviderName;
  model: string;
  revision: RevisionId;
  layerIndex: number;
  attempt: number;
  inputs: string[];
  produces: string[];
  context: Record<string, unknown>;
}

export interface ProviderResult {
  status?: ArtefactEventStatus;
  artefacts: ProducedArtefact[];
  diagnostics?: Record<string, unknown>;
}

export interface ProducerHandler {
  kind: ProducerKind;
  provider: ProviderName;
  model: string;
  mode: ProviderMode;
  invoke(request: ProviderJobContext): Promise<ProviderResult>;
}

export type HandlerFactory = (descriptor: ProviderDescriptor) => ProducerHandler;

export interface ProviderRegistryOptions {
  mode?: ProviderMode;
}

export interface ProviderRegistry {
  mode: ProviderMode;
  resolve(descriptor: ProviderDescriptor): ProducerHandler;
}
