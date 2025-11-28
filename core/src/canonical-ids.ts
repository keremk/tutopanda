import type { BlueprintInputDefinition, BlueprintTreeNode } from './types.js';

export function formatCanonicalInputId(namespacePath: string[], name: string): string {
  const qualified = namespacePath.length > 0 ? `${namespacePath.join('.')}.${name}` : name;
  return `Input:${qualified}`;
}

export function isCanonicalInputId(value: string): boolean {
  return typeof value === 'string' && value.startsWith('Input:');
}

export interface CanonicalInputEntry {
  canonicalId: string;
  name: string;
  namespacePath: string[];
  definition: BlueprintInputDefinition;
}

export function collectCanonicalInputs(tree: BlueprintTreeNode): CanonicalInputEntry[] {
  const entries: CanonicalInputEntry[] = [];
  const namespace = tree.namespacePath;
  for (const input of tree.document.inputs) {
    entries.push({
      canonicalId: formatCanonicalInputId(namespace, input.name),
      name: input.name,
      namespacePath: namespace,
      definition: input,
    });
  }
  for (const child of tree.children.values()) {
    entries.push(...collectCanonicalInputs(child));
  }
  return entries;
}

export interface InputIdResolver {
  resolve(raw: string): string;
  entries: CanonicalInputEntry[];
}

export function createInputIdResolver(
  tree: BlueprintTreeNode,
  extraEntries: CanonicalInputEntry[] = [],
): InputIdResolver {
  const entries = [...collectCanonicalInputs(tree), ...extraEntries];
  const canonicalIds = new Set(entries.map((entry) => entry.canonicalId));
  const qualifiedToCanonical = new Map<string, string>();
  const baseNameToCanonical = new Map<string, string[]>();

  for (const entry of entries) {
    const qualified = entry.namespacePath.length > 0
      ? `${entry.namespacePath.join('.')}.${entry.name}`
      : entry.name;
    qualifiedToCanonical.set(qualified, entry.canonicalId);
    const list = baseNameToCanonical.get(entry.name) ?? [];
    list.push(entry.canonicalId);
    baseNameToCanonical.set(entry.name, list);
  }

  const resolve = (raw: string): string => {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      throw new Error('Input keys must be non-empty strings.');
    }
    const key = raw.trim();
    if (isCanonicalInputId(key)) {
      if (!canonicalIds.has(key)) {
        throw new Error(`Unknown canonical input id "${key}".`);
      }
      return key;
    }
    const qualified = qualifiedToCanonical.get(key);
    if (qualified) {
      return qualified;
    }
    const baseMatches = baseNameToCanonical.get(key);
    if (!baseMatches || baseMatches.length === 0) {
      throw new Error(`Unknown input "${key}".`);
    }
    if (baseMatches.length > 1) {
      throw new Error(
        `Input "${key}" is ambiguous. Use a fully-qualified name (e.g., ${baseMatches[0]?.slice('Input:'.length)}).`,
      );
    }
    return baseMatches[0]!;
  };

  return { resolve, entries };
}

export function formatProducerScopedInputId(
  namespacePath: string[],
  producerName: string,
  key: string,
): string {
  const qualifiedProducer = namespacePath.length > 0
    ? `${namespacePath.join('.')}.${producerName}`
    : producerName;
  return `Input:${qualifiedProducer}.${key}`;
}

export function parseQualifiedProducerName(name: string): { namespacePath: string[]; producerName: string } {
  const segments = name.split('.').filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    throw new Error('Producer name must be non-empty.');
  }
  const producerName = segments[segments.length - 1]!;
  const namespacePath = segments.slice(0, -1);
  return { namespacePath, producerName };
}
