/* eslint-disable no-console */
import { readFile } from 'node:fs/promises';
import {
  parseCustomBlueprintConfig,
  composeBlueprint,
  getSectionById,
  type GraphBlueprint,
  type CustomBlueprintConfig,
} from 'tutopanda-core';
import { expandPath } from './path.js';

const console = globalThis.console;

/**
 * Load and compose a custom blueprint from a JSON file.
 */
export async function loadCustomBlueprint(blueprintPath: string): Promise<GraphBlueprint> {
  const expandedPath = expandPath(blueprintPath);
  const fileContent = await readFile(expandedPath, 'utf-8');
  const config: CustomBlueprintConfig = parseCustomBlueprintConfig(JSON.parse(fileContent));

  // Resolve section IDs to actual section objects
  const sections = [];
  for (const sectionId of config.sections) {
    const section = getSectionById(sectionId);
    if (!section) {
      throw new Error(
        `Unknown section "${sectionId}" in blueprint "${config.name}". ` +
        `Available sections: script, music, audio, images, videoFromText, videoFromImage, assembly`,
      );
    }
    sections.push(section);
  }

  // Compose the blueprint
  const { blueprint, warnings } = composeBlueprint(sections, config.connections, {
    autoConnect: config.autoConnect ?? false,
    validate: true,
  });

  // Log warnings if any
  if (warnings.length > 0) {
    console.warn(`Blueprint "${config.name}" loaded with warnings:`);
    for (const warning of warnings) {
      console.warn(`  - ${warning.message}`);
    }
  }

  return blueprint;
}
