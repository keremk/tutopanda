import { resolve } from 'node:path';
import { loadBlueprintFromToml } from '../lib/blueprint-loader/index.js';
import { expandPath } from '../lib/path.js';

export interface BlueprintsValidateOptions {
  blueprintPath: string;
}

export interface BlueprintsValidateResult {
  valid: boolean;
  path: string;
  name?: string;
  error?: string;
  nodeCount?: number;
  edgeCount?: number;
}

export async function runBlueprintsValidate(
  options: BlueprintsValidateOptions,
): Promise<BlueprintsValidateResult> {
  try {
    const expandedPath = resolve(expandPath(options.blueprintPath));
    const { blueprint } = await loadBlueprintFromToml(expandedPath);
    return {
      valid: true,
      path: expandedPath,
      name: blueprint.meta.name,
      nodeCount: blueprint.nodes.length,
      edgeCount: blueprint.edges.length,
    };
  } catch (error) {
    return {
      valid: false,
      path: resolve(options.blueprintPath),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
