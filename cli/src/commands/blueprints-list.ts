import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseBlueprintDocument } from '../lib/blueprint-loader/index.js';
import { getBundledBlueprintsRoot } from '../lib/config-assets.js';

const DEFAULT_BLUEPRINT_DIR = getBundledBlueprintsRoot();

export interface BlueprintsListResult {
  blueprints: Array<{
    path: string;
    name: string;
    description?: string;
    version?: string;
    inputCount: number;
    outputCount: number;
  }>;
}

export async function runBlueprintsList(
  directory: string = DEFAULT_BLUEPRINT_DIR,
): Promise<BlueprintsListResult> {
  const entries = await readdir(directory, { withFileTypes: true });
  const blueprints: BlueprintsListResult['blueprints'] = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.yaml')) {
      continue;
    }
    const fullPath = resolve(directory, entry.name);
    const blueprint = await parseBlueprintDocument(fullPath);
    blueprints.push({
      path: fullPath,
      name: blueprint.meta.name,
      description: blueprint.meta.description,
      version: blueprint.meta.version,
      inputCount: blueprint.inputs.length,
      outputCount: blueprint.artefacts.length,
    });
  }

  return { blueprints };
}
