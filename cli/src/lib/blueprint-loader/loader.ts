import { readFile } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { existsSync } from 'node:fs';
import type { Blueprint, ProducerConfig, SubBlueprintRef } from 'tutopanda-core';
import { flattenBlueprint } from 'tutopanda-core/blueprint-loader';
import { parseBlueprintToml } from './toml-parser.js';

/**
 * Result of loading a blueprint with all its sub-blueprints.
 */
export interface LoadedBlueprint {
  blueprint: Blueprint;
  producers: ProducerConfig[];
  subBlueprints: Map<string, Blueprint>;
}

/**
 * Load a blueprint from a TOML file, recursively loading all sub-blueprints.
 *
 * @param filePath - Absolute or relative path to the TOML blueprint file
 * @param cache - Internal cache for circular dependency detection and performance
 * @returns Loaded blueprint with flattened graph
 */
export async function loadBlueprintFromToml(
  filePath: string,
  cache: Map<string, Blueprint> = new Map(),
): Promise<LoadedBlueprint> {
  const absolutePath = resolve(filePath);

  // Check cache to avoid circular dependencies and redundant loads
  if (cache.has(absolutePath)) {
    const cached = cache.get(absolutePath)!;
    return {
      blueprint: cached,
      producers: cached.producers,
      subBlueprints: new Map(),
    };
  }

  // Load and parse TOML file
  const tomlContent = await readFile(absolutePath, 'utf8');
  const blueprint = parseBlueprintToml(tomlContent);

  // Add to cache immediately (for circular reference detection)
  cache.set(absolutePath, blueprint);

  // Recursively load sub-blueprints
  const loadedSubs = new Map<string, Blueprint>();
  const allProducers: ProducerConfig[] = [...blueprint.producers];

  for (const subRef of blueprint.subBlueprints) {
    const subPath = resolveSubBlueprintPath(absolutePath, subRef);

    try {
      const loaded = await loadBlueprintFromToml(subPath, cache);

      // Validate that loaded blueprint's ID matches the reference
      if (loaded.blueprint.meta.id !== subRef.blueprintId) {
        throw new Error(
          `Sub-blueprint ID mismatch: expected "${subRef.blueprintId}", got "${loaded.blueprint.meta.id}" in file ${subPath}`
        );
      }

      loadedSubs.set(subRef.blueprintId, loaded.blueprint);

      const namespacedProducers = loaded.producers.map((producer) => ({
        ...producer,
        name: `${subRef.id}.${producer.name}`,
      }));
      allProducers.push(...namespacedProducers);

      // Add nested sub-blueprints to the map
      for (const [id, sub] of loaded.subBlueprints) {
        if (!loadedSubs.has(id)) {
          loadedSubs.set(id, sub);
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to load sub-blueprint "${subRef.blueprintId}" from ${absolutePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Flatten blueprint hierarchy into single graph
  try {
    const flattened = flattenBlueprint(blueprint, loadedSubs);

    const flattenedBlueprint: Blueprint = {
      ...blueprint,
      nodes: flattened.nodes,
      edges: flattened.edges,
      producers: allProducers,
    };

    // Update cache with flattened version
    cache.set(absolutePath, flattenedBlueprint);

    return {
      blueprint: flattenedBlueprint,
      producers: allProducers,
      subBlueprints: loadedSubs,
    };
  } catch (error) {
    throw new Error(
      `Failed to flatten blueprint "${blueprint.meta.id}": ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Resolve the file path for a sub-blueprint.
 *
 * Looks for a TOML file matching the blueprint ID in the same directory as the parent.
 * Converts blueprint ID to kebab-case for file name matching.
 *
 * @param parentPath - Absolute path to the parent blueprint file
 * @param blueprintId - The ID of the sub-blueprint to find
 * @returns Absolute path to the sub-blueprint TOML file
 */
function resolveSubBlueprintPath(
  parentPath: string,
  subRef: SubBlueprintRef,
): string {
  const dir = dirname(parentPath);

  if (subRef.path) {
    const candidate = resolve(dir, subRef.path);
    return candidate;
  }

  const blueprintId = subRef.blueprintId;

  // Try exact match first: ScriptGeneration.toml
  const exactPath = resolve(dir, `${blueprintId}.toml`);
  if (existsSync(exactPath)) {
    return exactPath;
  }

  // If not found, try converting to kebab-case: script-generation.toml
  // This handles both PascalCase and camelCase IDs
  const kebabCase = blueprintId
    .replace(/([a-z])([A-Z])/g, '$1-$2')
    .toLowerCase();

  if (blueprintId !== kebabCase) {
    const kebabPath = resolve(dir, `${kebabCase}.toml`);
    if (existsSync(kebabPath)) {
      return kebabPath;
    }
  }

  // Fallback to exact path even if missing; upstream load will produce ENOENT
  return exactPath;
}

/**
 * Extract unique producer configs from a loaded blueprint.
 * Deduplicates by producer name.
 */
export function deduplicateProducers(producers: ProducerConfig[]): ProducerConfig[] {
  const seen = new Map<string, ProducerConfig>();

  for (const producer of producers) {
    if (!seen.has(producer.name)) {
      seen.set(producer.name, producer);
    } else {
      // If we see the same producer name again, validate they're compatible
      const existing = seen.get(producer.name)!;
      if (
        existing.provider !== producer.provider ||
        existing.model !== producer.model
      ) {
        console.warn(
          `Warning: Conflicting configurations for producer "${producer.name}". Using first definition.`
        );
      }
    }
  }

  return Array.from(seen.values());
}
