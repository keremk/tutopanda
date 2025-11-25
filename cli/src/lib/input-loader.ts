import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { BlueprintTreeNode } from '@tutopanda/core';

export type InputMap = Record<string, unknown>;

interface RawInputsFile {
  inputs?: unknown;
}

export async function loadInputsFromYaml(
  filePath: string,
  blueprint: BlueprintTreeNode,
  inquiryPromptOverride?: string,
): Promise<InputMap> {
  validateYamlExtension(filePath);
  const contents = await readFile(filePath, 'utf8');
  const parsed = parseYaml(contents) as RawInputsFile;
  const values = resolveInputSection(parsed);

  if (inquiryPromptOverride && typeof inquiryPromptOverride === 'string' && inquiryPromptOverride.trim()) {
    values.InquiryPrompt = inquiryPromptOverride;
  }

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

function validateYamlExtension(filePath: string): void {
  const extension = extname(filePath).toLowerCase();
  if (extension === '.yaml' || extension === '.yml') {
    return;
  }
  throw new Error(`Input files must be YAML (*.yaml or *.yml). Received: ${filePath}`);
}

function resolveInputSection(raw: RawInputsFile): Record<string, unknown> {
  if (raw && typeof raw === 'object' && raw.inputs && typeof raw.inputs === 'object') {
    return { ...(raw.inputs as Record<string, unknown>) };
  }
  if (raw && typeof raw === 'object') {
    return { ...(raw as Record<string, unknown>) };
  }
  throw new Error('Input file must define an inputs mapping with key/value pairs.');
}
