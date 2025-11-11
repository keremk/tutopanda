import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { BlueprintTreeNode } from 'tutopanda-core';
import { parseBlueprintDocument } from './toml-parser.js';

export interface BlueprintBundle {
  root: BlueprintTreeNode;
}

export async function loadBlueprintBundle(entryPath: string): Promise<BlueprintBundle> {
  const absolute = resolve(entryPath);
  const visiting = new Set<string>();
  const root = await loadNode(absolute, [], visiting);
  return { root };
}

async function loadNode(
  filePath: string,
  namespacePath: string[],
  visiting: Set<string>,
): Promise<BlueprintTreeNode> {
  const absolute = resolve(filePath);
  if (visiting.has(absolute)) {
    throw new Error(`Detected circular sub-blueprint reference at ${absolute}`);
  }
  visiting.add(absolute);
  const contents = await readFile(absolute, 'utf8');
  const document = parseBlueprintDocument(contents);
  const node: BlueprintTreeNode = {
    id: document.meta.id,
    namespacePath,
    document,
    children: new Map(),
  };

  for (const sub of document.subBlueprints) {
    const subNamespace = [...namespacePath, sub.name];
    const childPath = resolveSubBlueprintPath(absolute, sub);
    const child = await loadNode(childPath, subNamespace, visiting);
    if (child.id !== sub.name) {
      throw new Error(
        `Sub-blueprint id mismatch for ${sub.name}: expected "${sub.name}" but file declared "${child.id}".`,
      );
    }
    node.children.set(sub.name, child);
  }

  visiting.delete(absolute);
  return node;
}

function resolveSubBlueprintPath(
  parentFile: string,
  sub: { path?: string; name: string },
): string {
  const directory = dirname(parentFile);
  if (sub.path) {
    return resolve(directory, sub.path);
  }
  return resolve(directory, `${sub.name}.toml`);
}
