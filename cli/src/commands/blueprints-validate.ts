import { readFile } from 'node:fs/promises';
import {
  parseCustomBlueprintConfig,
  composeBlueprint,
  getSectionById,
  type CustomBlueprintConfig,
  type ValidationWarning,
} from 'tutopanda-core';
import { expandPath } from '../lib/path.js';

export interface BlueprintsValidateOptions {
  blueprintPath: string;
}

export interface BlueprintsValidateResult {
  valid: boolean;
  config: CustomBlueprintConfig;
  warnings: ValidationWarning[];
  error?: string;
}

export async function runBlueprintsValidate(
  options: BlueprintsValidateOptions,
): Promise<BlueprintsValidateResult> {
  try {
    const expandedPath = expandPath(options.blueprintPath);
    const fileContent = await readFile(expandedPath, 'utf-8');
    const config: CustomBlueprintConfig = parseCustomBlueprintConfig(JSON.parse(fileContent));

    // Resolve section IDs to actual section objects
    const sections = [];
    for (const sectionId of config.sections) {
      const section = getSectionById(sectionId);
      if (!section) {
        return {
          valid: false,
          config,
          warnings: [],
          error: `Unknown section "${sectionId}". Available sections: script, music, audio, images, videoFromText, videoFromImage, assembly`,
        };
      }
      sections.push(section);
    }

    // Compose and validate the blueprint
    const { warnings } = composeBlueprint(sections, config.connections, {
      autoConnect: config.autoConnect ?? false,
      validate: true,
    });

    return {
      valid: true,
      config,
      warnings,
    };
  } catch (error) {
    return {
      valid: false,
      config: {} as CustomBlueprintConfig,
      warnings: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
