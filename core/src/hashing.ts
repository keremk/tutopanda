import { createHash } from 'node:crypto';
import type { ArtefactEventOutput } from './types.js';

export interface HashedValue {
  hash: string;
  canonical: string;
}

export function hashPayload(payload: unknown): HashedValue {
  const canonical = canonicalStringify(payload);
  return {
    canonical,
    hash: hashCanonical(canonical),
  };
}

export function hashInputPayload(payload: unknown): string {
  return hashPayload(payload).hash;
}

export function hashArtefactOutput(output: ArtefactEventOutput): string {
  return hashPayload(output).hash;
}

export function hashInputs(inputs: readonly string[]): string {
  const sorted = [...inputs].sort();
  return hashPayload(sorted).hash;
}

export function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalizeForSerialization(value));
}

export function normalizeForSerialization(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForSerialization(item));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
    const output: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      output[key] = normalizeForSerialization(val);
    }
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return value.toString();
  }
  return value;
}

export function hashCanonical(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex');
}
