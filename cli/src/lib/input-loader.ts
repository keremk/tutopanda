import { readFile } from 'node:fs/promises';
import { parse as parseToml } from 'smol-toml';
import type { Blueprint, BlueprintExpansionConfig } from 'tutopanda-core';

export type InputMap = Record<string, unknown>;

interface RawInputsFile {
  inputs?: unknown;
}

export async function loadInputsFromToml(
  filePath: string,
  blueprint: Blueprint,
): Promise<InputMap> {
  const contents = await readFile(filePath, 'utf8');
  const parsed = parseToml(contents) as RawInputsFile;
  if (!parsed.inputs || typeof parsed.inputs !== 'object') {
    throw new Error(`Input TOML must contain an [inputs] table: ${filePath}`);
  }

  const values = { ...(parsed.inputs as Record<string, unknown>) };

  const missingRequired = blueprint.inputs
    .filter((input) => input.required)
    .filter((input) => values[input.name] === undefined)
    .map((input) => input.name);

  if (missingRequired.length > 0) {
    throw new Error(`Input file missing required fields: ${missingRequired.join(', ')}`);
  }

  for (const inputDef of blueprint.inputs) {
    if (values[inputDef.name] === undefined && inputDef.defaultValue !== undefined) {
      values[inputDef.name] = inputDef.defaultValue;
    }
  }

  return values;
}

export function deriveExpansionConfig(inputs: InputMap): BlueprintExpansionConfig {
  const numSegments = readNumber(inputs, 'NumOfSegments')
    ?? computeSegmentsFromDuration(inputs)
    ?? 1;
  const imagesPerSegment = readNumber(inputs, 'ImagesPerSegment') ?? 1;

  return {
    segmentCount: Math.max(1, numSegments),
    imagesPerSegment: Math.max(1, imagesPerSegment),
  };
}

function computeSegmentsFromDuration(inputs: InputMap): number | undefined {
  const duration = readNumber(inputs, 'Duration');
  if (typeof duration !== 'number' || Number.isNaN(duration)) {
    return undefined;
  }
  return Math.max(1, Math.round(duration / 10));
}

function readNumber(inputs: InputMap, key: string): number | undefined {
  const value = inputs[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
}
