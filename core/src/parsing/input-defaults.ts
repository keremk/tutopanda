import { formatCanonicalInputId } from './canonical-ids.js';
import type { BlueprintTreeNode } from '../types.js';

/**
 * Apply declared default values from a blueprint tree into a canonical input map.
 * Parsing owns default application so other stages consume a fully materialized
 * input surface without re-seeding.
 */
export function applyBlueprintInputDefaults(
  tree: BlueprintTreeNode,
  resolvedInputs: Record<string, unknown>,
  inputSources?: Map<string, string>,
): void {
  const namespace = tree.namespacePath;
  for (const input of tree.document.inputs) {
    if (input.defaultValue === undefined) {
      continue;
    }
    const canonicalId = formatCanonicalInputId(namespace, input.name);
    if (inputSources) {
      const sourceId = inputSources.get(canonicalId);
      if (sourceId && sourceId !== canonicalId) {
        continue;
      }
    }
    if (resolvedInputs[canonicalId] === undefined) {
      resolvedInputs[canonicalId] = input.defaultValue;
    }
  }
  for (const child of tree.children.values()) {
    applyBlueprintInputDefaults(child, resolvedInputs, inputSources);
  }
}
