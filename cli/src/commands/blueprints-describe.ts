import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseBlueprintToml } from '../lib/blueprint-loader/index.js';

export interface BlueprintsDescribeOptions {
  blueprintPath: string;
}

export interface BlueprintsDescribeResult {
  path: string;
  name: string;
  description?: string;
  version?: string;
  inputs: {
    name: string;
    type: string;
    cardinality: string;
    required: boolean;
    description?: string;
  }[];
  outputs: {
    name: string;
    type: string;
    cardinality: string;
    required: boolean;
    description?: string;
  }[];
  nodeCount: number;
  edgeCount: number;
}

export async function runBlueprintsDescribe(
  options: BlueprintsDescribeOptions,
): Promise<BlueprintsDescribeResult> {
  const targetPath = resolve(options.blueprintPath);
  const contents = await readFile(targetPath, 'utf8');
  const blueprint = parseBlueprintToml(contents);

  return {
    path: targetPath,
    name: blueprint.meta.name,
    description: blueprint.meta.description,
    version: blueprint.meta.version,
    inputs: blueprint.inputs.map((input) => ({
      name: input.name,
      type: input.type,
      cardinality: input.cardinality,
      required: input.required,
      description: input.description,
    })),
    outputs: blueprint.outputs.map((output) => ({
      name: output.name,
      type: output.type,
      cardinality: output.cardinality,
      required: output.required,
      description: output.description,
    })),
    nodeCount: blueprint.nodes.length,
    edgeCount: blueprint.edges.length,
  };
}
