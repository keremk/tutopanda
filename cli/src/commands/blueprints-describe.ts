import { getSectionById, type SectionPort } from 'tutopanda-core';

export interface BlueprintsDescribeOptions {
  sectionId: string;
}

export interface BlueprintsDescribeResult {
  id: string;
  label: string;
  inputs: SectionPort[];
  outputs: SectionPort[];
}

export async function runBlueprintsDescribe(
  options: BlueprintsDescribeOptions,
): Promise<BlueprintsDescribeResult> {
  const section = getSectionById(options.sectionId);

  if (!section) {
    throw new Error(
      `Unknown section "${options.sectionId}". ` +
      `Available sections: script, music, audio, images, videoFromText, videoFromImage, assembly`,
    );
  }

  return {
    id: section.id,
    label: section.label,
    inputs: section.inputs ?? [],
    outputs: section.outputs ?? [],
  };
}
