import type { JobDescriptor, ProducerJobContext } from './types.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractResolvedInputs(context?: ProducerJobContext): Record<string, unknown> {
  if (!context || !context.extras) {
    return {};
  }
  const extras = context.extras;
  if (isRecord(extras.resolvedInputs)) {
    return extras.resolvedInputs as Record<string, unknown>;
  }
  return {};
}

export interface PreparedJobContext {
  resolvedInputs: Record<string, unknown>;
  context?: ProducerJobContext;
}

export function prepareJobContext(
  job: JobDescriptor,
  baseInputs: Record<string, unknown>,
): PreparedJobContext {
  const resolvedInputs: Record<string, unknown> = {
    ...baseInputs,
  };
  for (const [key, value] of Object.entries(baseInputs)) {
    if (key.startsWith('Input:') || key.startsWith('Artifact:')) {
      continue;
    }
    const canonicalId = `Input:${key}`;
    if (resolvedInputs[canonicalId] === undefined) {
      resolvedInputs[canonicalId] = value;
    }
  }
  const jobResolved = extractResolvedInputs(job.context);
  Object.assign(resolvedInputs, jobResolved);
  const bindings = job.context?.inputBindings;
  if (bindings) {
    for (const [alias, canonicalId] of Object.entries(bindings)) {
      const aliasValue = resolvedInputs[alias];
      if (aliasValue !== undefined && resolvedInputs[canonicalId] === undefined) {
        resolvedInputs[canonicalId] = aliasValue;
      }
      const canonicalValue = resolvedInputs[canonicalId];
      if (canonicalValue !== undefined && resolvedInputs[alias] === undefined) {
        resolvedInputs[alias] = canonicalValue;
      }
    }
  }

  return {
    resolvedInputs,
    context: job.context,
  };
}
