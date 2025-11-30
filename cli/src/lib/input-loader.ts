import type { BlueprintTreeNode } from '@tutopanda/core';
import {
  loadInputsFromYaml as coreLoadInputsFromYaml,
  type InputMap,
  type ModelSelection,
} from '@tutopanda/core';
import { buildProducerOptionsFromBlueprint, type ProducerOptionsMap } from './producer-options.js';

export interface LoadedInputs {
  values: InputMap;
  modelSelections: ModelSelection[];
  providerOptions: ProducerOptionsMap;
}

export type { InputMap, ModelSelection };

export async function loadInputsFromYaml(
  filePath: string,
  blueprint: BlueprintTreeNode,
  allowAmbiguousDefault = false,
): Promise<LoadedInputs> {
  const base = await coreLoadInputsFromYaml(filePath, blueprint);
  const providerOptions = buildProducerOptionsFromBlueprint(blueprint, base.modelSelections, allowAmbiguousDefault);
  return {
    ...base,
    providerOptions,
  };
}
