import { resolve } from 'node:path';
import type { BlueprintTreeNode } from 'tutopanda-core';
import { loadYamlBlueprintTree } from 'tutopanda-core/blueprint-loader';

export interface BlueprintBundle {
  root: BlueprintTreeNode;
}

export async function loadBlueprintBundle(entryPath: string): Promise<BlueprintBundle> {
  const absolute = resolve(entryPath);
  return loadYamlBlueprintTree(absolute);
}
