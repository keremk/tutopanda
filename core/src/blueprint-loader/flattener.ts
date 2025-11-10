import type {
  Blueprint,
  BlueprintNode,
  BlueprintEdge,
  BlueprintNodeRef,
  CardinalityDimension,
  CardinalityTag,
} from '../types.js';
import { prefixNodeRef, resolveEdges } from './resolver.js';

/**
 * Flattened blueprint result.
 */
export interface FlattenedBlueprint {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

/**
 * Flatten a blueprint with sub-blueprints into a single graph.
 *
 * This function:
 * 1. Adds the parent blueprint's own nodes (no namespace)
 * 2. Recursively flattens sub-blueprints and adds their nodes with namespace prefixes
 * 3. Resolves all edges, including those using dot notation
 * 4. Validates that all edge references are valid
 *
 * @param blueprint - The blueprint to flatten
 * @param loadedSubBlueprints - Map of loaded sub-blueprints by their meta.id
 * @returns Flattened blueprint with all nodes and edges
 */
export function flattenBlueprint(
  blueprint: Blueprint,
  loadedSubBlueprints: Map<string, Blueprint>,
): FlattenedBlueprint {
  const uniqueNodes = new Map<string, BlueprintNode>();
  const nodeKindById = new Map<string, BlueprintNodeRef['kind']>();
  const allEdges: BlueprintEdge[] = [];

  // 1. Add parent blueprint's own nodes (no namespace)
  for (const node of blueprint.nodes) {
    const key = refKey(node.ref);
    const existing = uniqueNodes.get(key);

    if (existing) {
      // Validate cardinality consistency
      if (existing.cardinality !== node.cardinality) {
        throw new Error(
          `Conflicting cardinality for node ${key}: ${existing.cardinality} vs ${node.cardinality}`,
        );
      }
    } else {
      uniqueNodes.set(key, { ...node });
      nodeKindById.set(node.ref.id, node.ref.kind);
    }
  }

  // 2. Add sub-blueprint nodes with namespace
  for (const subRef of blueprint.subBlueprints) {
    const subBlueprint = loadedSubBlueprints.get(subRef.blueprintId);

    if (!subBlueprint) {
      throw new Error(
        `Sub-blueprint "${subRef.blueprintId}" not found. Make sure it's loaded before flattening.`
      );
    }

    // Recursively flatten the sub-blueprint
    const flattened = flattenBlueprint(subBlueprint, loadedSubBlueprints);

    // Add namespaced nodes from sub-blueprint
    for (const node of flattened.nodes) {
      const namespacedRef = node.ref.kind === 'InputSource'
        ? node.ref
        : prefixNodeRef(node.ref, subRef.id);
      const key = refKey(namespacedRef);

      const existing = uniqueNodes.get(key);
      if (existing) {
        // Validate cardinality consistency
        if (existing.cardinality !== node.cardinality) {
          throw new Error(
            `Conflicting cardinality for node ${key}: ${existing.cardinality} vs ${node.cardinality}`,
          );
        }
      } else {
        uniqueNodes.set(key, {
          ...node,
          ref: namespacedRef,
        });
        nodeKindById.set(namespacedRef.id, namespacedRef.kind);
        if (node.ref.kind === 'InputSource') {
          nodeKindById.set(`${subRef.id}.${node.ref.id}`, node.ref.kind);
        }
      }
    }

    // Add namespaced edges from sub-blueprint
    for (const edge of flattened.edges) {
      const namespacedEdge: BlueprintEdge = {
        ...edge,
        from: edge.from.kind === 'InputSource' ? edge.from : prefixNodeRef(edge.from, subRef.id),
        to: edge.to.kind === 'InputSource' ? edge.to : prefixNodeRef(edge.to, subRef.id),
      };
      allEdges.push(namespacedEdge);
    }
  }

  // 3. Resolve parent blueprint's edges (handle dot notation)
  const resolvedParentEdges = resolveEdges(
    blueprint.edges,
    blueprint.subBlueprints,
    nodeKindById,
  );
  allEdges.push(...resolvedParentEdges);

  // 4. Validate all edges reference valid nodes
  for (const edge of allEdges) {
    const fromKey = refKey(edge.from);
    const toKey = refKey(edge.to);

    if (!uniqueNodes.has(fromKey)) {
      throw new Error(`Edge references unknown source node: ${fromKey}`);
    }

    if (!uniqueNodes.has(toKey)) {
      throw new Error(`Edge references unknown target node: ${toKey}`);
    }

    // Validate dimensions are compatible with node cardinalities
    if (edge.dimensions && edge.dimensions.length > 0) {
      const fromNode = uniqueNodes.get(fromKey)!;
      const toNode = uniqueNodes.get(toKey)!;
      const allowed = new Set<CardinalityDimension>([
        ...cardinalityDimensionsFor(fromNode.cardinality),
        ...cardinalityDimensionsFor(toNode.cardinality),
      ]);

      for (const dim of edge.dimensions) {
        if (!allowed.has(dim)) {
          throw new Error(
            `Edge ${fromKey} -> ${toKey} references dimension ${dim} that is not present on either node`,
          );
        }
      }
    }
  }

  return {
    nodes: Array.from(uniqueNodes.values()),
    edges: allEdges,
  };
}

/**
 * Create a string key for a node reference.
 */
export function refKey(ref: BlueprintNodeRef): string {
  return `${ref.kind}:${ref.id}`;
}

/**
 * Get the cardinality dimensions for a given cardinality tag.
 */
function cardinalityDimensionsFor(cardinality: CardinalityTag): CardinalityDimension[] {
  switch (cardinality) {
    case 'single':
      return [];
    case 'perSegment':
      return ['segment'];
    case 'perSegmentImage':
      return ['segment', 'image'];
    default: {
      const exhaustive: never = cardinality;
      throw new Error(`Unhandled cardinality ${exhaustive}`);
    }
  }
}
