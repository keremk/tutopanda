import type {
  GraphBlueprint,
  BlueprintSection,
  SectionConnection,
  ValidationError,
  ValidationWarning,
} from '../types.js';

export interface ValidationResult {
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

/**
 * Validate a composed blueprint.
 */
export function validateBlueprint(
  blueprint: GraphBlueprint,
  sectionMap: Map<string, BlueprintSection>,
  connections: SectionConnection[],
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check 1: All required inputs that expect connections are connected
  // Only check inputs that reference artifacts (outputs from other sections)
  // User-provided inputs (inputRef) don't need connections
  const connectedInputs = new Set<string>();
  for (const conn of connections) {
    connectedInputs.add(`${conn.to.section}.${conn.to.port}`);
  }

  for (const [sectionId, section] of sectionMap) {
    for (const input of section.inputs ?? []) {
      // Skip validation for inputs that are provided by the user (InputSource)
      // Only validate inputs that expect data from other sections (Artifact)
      const isUserInput = input.ref.kind === 'InputSource';
      if (input.required && !isUserInput) {
        const key = `${sectionId}.${input.name}`;
        if (!connectedInputs.has(key)) {
          errors.push(
            createValidationError(
              'required_input_missing',
              `Required input "${input.name}" of section "${sectionId}" is not connected`,
              { section: sectionId, port: input.name },
            ),
          );
        }
      }
    }
  }

  // Check 2: No circular dependencies
  const circularDeps = findCircularDependencies(sectionMap, connections);
  if (circularDeps.length > 0) {
    errors.push(
      createValidationError(
        'circular_dependency',
        `Circular dependency detected: ${circularDeps.join(' → ')}`,
        { cycle: circularDeps },
      ),
    );
  }

  // Check 3: Unused outputs (warning only)
  const connectedOutputs = new Set<string>();
  for (const conn of connections) {
    connectedOutputs.add(`${conn.from.section}.${conn.from.port}`);
  }

  for (const [sectionId, section] of sectionMap) {
    for (const output of section.outputs ?? []) {
      const key = `${sectionId}.${output.name}`;
      if (!connectedOutputs.has(key) && output.required) {
        warnings.push({
          type: 'unused_output',
          message: `Output "${output.name}" of section "${sectionId}" is not connected`,
          section: sectionId,
          port: output.name,
        });
      }
    }
  }

  return { errors, warnings };
}

/**
 * Find circular dependencies in the section graph.
 */
function findCircularDependencies(
  sectionMap: Map<string, BlueprintSection>,
  connections: SectionConnection[],
): string[] {
  // Build adjacency list
  const graph = new Map<string, Set<string>>();
  for (const [sectionId] of sectionMap) {
    graph.set(sectionId, new Set());
  }
  for (const conn of connections) {
    graph.get(conn.from.section)?.add(conn.to.section);
  }

  // DFS to detect cycles
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): boolean {
    visited.add(node);
    recStack.add(node);
    path.push(node);

    for (const neighbor of graph.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        if (dfs(neighbor)) {
          return true;
        }
      } else if (recStack.has(neighbor)) {
        // Cycle detected
        return true;
      }
    }

    recStack.delete(node);
    path.pop();
    return false;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) {
        return path;
      }
    }
  }

  return [];
}

/**
 * Create a validation error.
 */
function createValidationError(
  type: ValidationError['type'],
  message: string,
  details?: Record<string, unknown>,
): ValidationError {
  const error = new Error(message) as ValidationError;
  error.type = type;
  error.details = details;
  if (details?.section) {
    error.section = details.section as string;
  }
  if (details?.port) {
    error.port = details.port as string;
  }
  return error;
}
