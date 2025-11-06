import { listSections } from 'tutopanda-core';

export interface BlueprintsListResult {
  sections: Array<{
    id: string;
    label: string;
    inputCount: number;
    outputCount: number;
  }>;
}

export async function runBlueprintsList(): Promise<BlueprintsListResult> {
  const sections = listSections();

  return {
    sections: sections.map((section) => ({
      id: section.id,
      label: section.label,
      inputCount: section.inputs?.length ?? 0,
      outputCount: section.outputs?.length ?? 0,
    })),
  };
}
