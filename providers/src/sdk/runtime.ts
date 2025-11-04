import type { ProviderAttachment, ProviderDescriptor, ProviderJobContext, ProviderLogger } from '../types.js';
import type {
  ProducerRuntime,
  ProducerDomain,
  ProducerRuntimeConfig,
  AttachmentReader,
  ResolvedInputsAccessor,
  ArtefactRegistry,
} from './types.js';

type ConfigValidator<T = unknown> = (value: unknown) => T;

interface RuntimeInit {
  descriptor: ProviderDescriptor;
  domain: ProducerDomain;
  request: ProviderJobContext;
  logger?: ProviderLogger;
  configValidator?: ConfigValidator;
}

export function createProducerRuntime(init: RuntimeInit): ProducerRuntime {
  const { descriptor, domain, request, logger, configValidator } = init;
  const config = createRuntimeConfig(request.context.providerConfig, configValidator);
  const attachments = createAttachmentReader(request.context.rawAttachments ?? []);
  const inputs = createInputsAccessor(resolveInputs(request.context.extras));
  const artefacts = createArtefactRegistry(request.produces);

  return {
    descriptor,
    domain,
    config,
    attachments,
    inputs,
    artefacts,
    logger,
  };
}

function createRuntimeConfig(raw: unknown, validator?: ConfigValidator): ProducerRuntimeConfig {
  return {
    raw,
    parse<T = unknown>(schema?: (value: unknown) => T): T {
      const effective = (schema ?? validator) as ((value: unknown) => T) | undefined;
      if (!effective) {
        return raw as T;
      }
      return effective(raw);
    },
  };
}

function createAttachmentReader(source: ProviderAttachment[]): AttachmentReader {
  const attachments = [...source];
  return {
    all() {
      return attachments;
    },
    find(name: string) {
      return attachments.find((attachment) => attachment.name === name);
    },
    text(name: string) {
      const attachment = attachments.find((entry) => entry.name === name);
      return attachment ? attachment.contents : undefined;
    },
  };
}

function resolveInputs(extras: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!extras || typeof extras !== 'object') {
    return {};
  }
  const resolved = extras.resolvedInputs;
  if (!resolved || typeof resolved !== 'object') {
    return {};
  }
  return { ...(resolved as Record<string, unknown>) };
}

function createInputsAccessor(source: Record<string, unknown>): ResolvedInputsAccessor {
  return {
    all() {
      return source;
    },
    get<T = unknown>(key: string) {
      return source[key] as T | undefined;
    },
  };
}

function createArtefactRegistry(produces: string[]): ArtefactRegistry {
  const set = new Set(produces);
  function ensure(id: string): string {
    if (!set.has(id)) {
      throw new Error(`Unknown artefact "${id}" for producer invoke.`);
    }
    return id;
  }
  return {
    expectInline(artefactId: string) {
      return ensure(artefactId);
    },
    expectBlob(artefactId: string) {
      return ensure(artefactId);
    },
  };
}
