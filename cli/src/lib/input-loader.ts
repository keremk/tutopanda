import { readFile } from 'node:fs/promises';
import { parse as parseToml } from 'smol-toml';
import type { BlueprintTreeNode } from 'tutopanda-core';

export type InputMap = Record<string, unknown>;

interface RawInputsFile {
  inputs?: unknown;
}

export async function loadInputsFromToml(
  filePath: string,
  blueprint: BlueprintTreeNode,
): Promise<InputMap> {
  const contents = await readFile(filePath, 'utf8');
  const parsed = parseToml(contents) as RawInputsFile;
  if (!parsed.inputs || typeof parsed.inputs !== 'object') {
    throw new Error(`Input TOML must contain an [inputs] table: ${filePath}`);
  }

  const values = { ...(parsed.inputs as Record<string, unknown>) };

  const missingRequired = blueprint.document.inputs
    .filter((input) => input.required)
    .filter((input) => values[input.name] === undefined)
    .map((input) => input.name);

  if (missingRequired.length > 0) {
    throw new Error(`Input file missing required fields: ${missingRequired.join(', ')}`);
  }

  for (const inputDef of blueprint.document.inputs) {
    if (values[inputDef.name] === undefined && inputDef.defaultValue !== undefined) {
      values[inputDef.name] = inputDef.defaultValue;
    }
  }

  return values;
}
