import type {
  GraphBlueprint,
  BlueprintSection,
  SectionConnection,
  SectionPort,
  BlueprintEdge,
  ComposedBlueprint,
  ValidationWarning,
  CardinalityTag,
  CardinalityDimension,
  Condition,
} from '../types.js';
import { edge } from './helpers.js';
import { validateBlueprint } from './validation.js';

/**
 * Compose a custom blueprint from selected sections and connections.
 *
 * @param sections - Array of blueprint sections to include
 * @param connections - Explicit port connections between sections
 * @param options - Composition options
 * @returns Composed blueprint with any warnings
 */
export function composeBlueprint(
  sections: BlueprintSection[],
  connections: SectionConnection[],
  options: {
    autoConnect?: boolean;
    validate?: boolean;
  } = {},
): ComposedBlueprint {
  const { autoConnect = false, validate = true } = options;
  const warnings: ValidationWarning[] = [];

  // Step 1: Validate sections have port definitions
  validateSectionsHavePorts(sections);

  // Step 2: Build section lookup map
  const sectionMap = new Map(sections.map((s) => [s.id, s]));

  // Step 3: Auto-connect if enabled
  const allConnections = [...connections];
  if (autoConnect) {
    const autoConnections = inferAutoConnections(sections);
    allConnections.push(...autoConnections.connections);
    warnings.push(...autoConnections.warnings);
  }

  // Step 4: Create connection edges from port connections
  const connectionEdges = createConnectionEdges(allConnections, sectionMap);

  // Step 5: Create connections section
  const connectionsSection: BlueprintSection = {
    id: 'port-connections',
    label: 'Port-Based Connections',
    nodes: [],
    edges: connectionEdges,
  };

  // Step 6: Compose final blueprint
  const blueprint: GraphBlueprint = {
    sections: [...sections, connectionsSection],
  };

  // Step 7: Validate if requested
  if (validate) {
    const validationResult = validateBlueprint(blueprint, sectionMap, allConnections);
    if (validationResult.errors.length > 0) {
      throw validationResult.errors[0]; // Throw first error
    }
    warnings.push(...validationResult.warnings);
  }

  return { blueprint, warnings };
}

/**
 * Validate that sections have port definitions.
 */
function validateSectionsHavePorts(sections: BlueprintSection[]): void {
  for (const section of sections) {
    if (!section.inputs && !section.outputs) {
      throw new Error(
        `Section "${section.id}" does not have port definitions. ` +
        `Port-based composition requires sections to declare inputs/outputs.`,
      );
    }
  }
}

/**
 * Create edges from port connections.
 */
function createConnectionEdges(
  connections: SectionConnection[],
  sectionMap: Map<string, BlueprintSection>,
): BlueprintEdge[] {
  const edges: BlueprintEdge[] = [];

  for (const conn of connections) {
    const fromSection = sectionMap.get(conn.from.section);
    const toSection = sectionMap.get(conn.to.section);

    if (!fromSection) {
      throw new Error(`Unknown source section: ${conn.from.section}`);
    }
    if (!toSection) {
      throw new Error(`Unknown target section: ${conn.to.section}`);
    }

    // Find output port in source section
    const outputPort = fromSection.outputs?.find((p) => p.name === conn.from.port);
    if (!outputPort) {
      throw new Error(
        `Section "${conn.from.section}" does not have output port "${conn.from.port}". ` +
        `Available ports: ${fromSection.outputs?.map((p) => p.name).join(', ') || 'none'}`,
      );
    }

    // Find input port in target section
    const inputPort = toSection.inputs?.find((p) => p.name === conn.to.port);
    if (!inputPort) {
      throw new Error(
        `Section "${conn.to.section}" does not have input port "${conn.to.port}". ` +
        `Available ports: ${toSection.inputs?.map((p) => p.name).join(', ') || 'none'}`,
      );
    }

    // Validate compatibility
    validatePortCompatibility(outputPort, inputPort, conn);

    // Determine dimensions for edge
    const dimensions = inferDimensions(outputPort.cardinality, inputPort.cardinality);

    // Create edge
    edges.push(
      edge(outputPort.ref, inputPort.ref, {
        dimensions,
        // Combine conditions from both ports
        when: combineConditions(outputPort.when, inputPort.when),
      }),
    );
  }

  return edges;
}

/**
 * Validate that two ports are compatible.
 */
function validatePortCompatibility(
  from: SectionPort,
  to: SectionPort,
  conn: SectionConnection,
): void {
  // Check cardinality compatibility
  const compatible = isCardinalityCompatible(from.cardinality, to.cardinality);
  if (!compatible) {
    throw new Error(
      `Incompatible cardinality for connection ${conn.from.section}.${conn.from.port} → ${conn.to.section}.${conn.to.port}: ` +
      `cannot connect ${from.cardinality} → ${to.cardinality}`,
    );
  }

  // TODO: Add node kind compatibility check
  // TODO: Add type compatibility check (future)
}

/**
 * Check if two cardinalities are compatible.
 */
function isCardinalityCompatible(from: CardinalityTag, to: CardinalityTag): boolean {
  // Compatibility matrix
  const matrix: Record<string, string[]> = {
    single: ['single', 'perSegment', 'perSegmentImage'],
    perSegment: ['perSegment', 'perSegmentImage'],
    perSegmentImage: ['perSegmentImage'],
  };

  return matrix[from]?.includes(to) ?? false;
}

/**
 * Infer edge dimensions based on cardinality.
 */
function inferDimensions(from: CardinalityTag, to: CardinalityTag): CardinalityDimension[] | undefined {
  if (from === 'single' && to === 'single') {
    return undefined; // No dimensions needed
  }
  if (from === 'single' && to === 'perSegment') {
    return undefined; // Broadcast
  }
  if (from === 'single' && to === 'perSegmentImage') {
    return undefined; // Broadcast
  }
  if (from === 'perSegment' && to === 'perSegment') {
    return ['segment']; // Direct mapping
  }
  if (from === 'perSegment' && to === 'perSegmentImage') {
    return ['segment']; // Broadcast within segment
  }
  if (from === 'perSegmentImage' && to === 'perSegmentImage') {
    return ['segment', 'image']; // Direct mapping
  }

  return undefined;
}

/**
 * Combine conditions from two ports.
 */
function combineConditions(
  when1: Condition[][] | undefined,
  when2: Condition[][] | undefined,
): Condition[] | undefined {
  if (!when1 && !when2) {
    return undefined;
  }
  if (!when1) {
    return when2?.[0]; // Flatten to single condition array
  }
  if (!when2) {
    return when1?.[0]; // Flatten to single condition array
  }

  // AND semantics: both conditions must be satisfied
  // Combine as disjunctive normal form (DNF)
  const combined: Condition[] = [];
  for (const clause1 of when1) {
    for (const clause2 of when2) {
      combined.push(...clause1, ...clause2);
    }
  }

  return combined.length > 0 ? combined : undefined;
}

/**
 * Infer automatic connections based on port names and requirements.
 */
function inferAutoConnections(
  sections: BlueprintSection[],
): {
  connections: SectionConnection[];
  warnings: ValidationWarning[];
} {
  const connections: SectionConnection[] = [];
  const warnings: ValidationWarning[] = [];

  // Build output port index: portName → [{ section, port }]
  const outputIndex = new Map<string, Array<{ section: string; port: SectionPort }>>();
  for (const section of sections) {
    for (const output of section.outputs ?? []) {
      if (!outputIndex.has(output.name)) {
        outputIndex.set(output.name, []);
      }
      outputIndex.get(output.name)!.push({ section: section.id, port: output });
    }
  }

  // For each section, try to auto-connect required inputs
  for (const section of sections) {
    for (const input of section.inputs ?? []) {
      if (!input.required) {
        continue;
      }

      // Find matching output ports
      const matches = outputIndex.get(input.name) ?? [];

      if (matches.length === 0) {
        // No match found - this will be caught by validation
        continue;
      }

      if (matches.length === 1) {
        // Exactly one match - auto-connect
        const match = matches[0];
        if (isCardinalityCompatible(match.port.cardinality, input.cardinality)) {
          connections.push({
            from: { section: match.section, port: match.port.name },
            to: { section: section.id, port: input.name },
          });
          warnings.push({
            type: 'auto_connected',
            message: `Auto-connected ${match.section}.${match.port.name} → ${section.id}.${input.name}`,
            section: section.id,
            port: input.name,
          });
        }
      } else {
        // Multiple matches - cannot auto-connect (ambiguous)
        // User must specify explicitly
      }
    }
  }

  return { connections, warnings };
}
