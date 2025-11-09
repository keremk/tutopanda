import type {
  BlueprintEdge,
  BlueprintExpansionConfig,
  BlueprintNode,
  BlueprintNodeRef,
  CardinalityDimension,
  CardinalityTag,
} from './types.js';

export type NodeInstanceIndex = Partial<Record<CardinalityDimension, number>>;

export interface PlannedNodeInstance {
  key: string;
  ref: BlueprintNodeRef;
  cardinality: CardinalityTag;
  index: NodeInstanceIndex;
  active: boolean;
  label?: string;
  description?: string;
}

export interface PlannedEdgeInstance {
  from: string;
  to: string;
  fromRef: BlueprintNodeRef;
  toRef: BlueprintNodeRef;
  dimensions: CardinalityDimension[];
  note?: string;
}

export interface ExpandedBlueprint {
  config: BlueprintExpansionConfig;
  nodes: PlannedNodeInstance[];
  edges: PlannedEdgeInstance[];
}

export interface BlueprintGraphData {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

export function expandBlueprint(
  config: BlueprintExpansionConfig,
  blueprint: BlueprintGraphData,
): ExpandedBlueprint {
  validateEdges(blueprint);

  const instanceMap = new Map<string, PlannedNodeInstance[]>();
  const allInstances: PlannedNodeInstance[] = [];

  for (const node of blueprint.nodes) {
    const instances = expandNodeInstances(node, config);
    if (instances.length === 0) {
      continue;
    }
    instanceMap.set(refKey(node.ref), instances);
    allInstances.push(...instances);
  }

  const plannedEdges: PlannedEdgeInstance[] = [];
  const activeNodeIds = new Set<string>();

  for (const edge of blueprint.edges) {
    const fromInstances = instanceMap.get(refKey(edge.from)) ?? [];
    const toInstances = instanceMap.get(refKey(edge.to)) ?? [];
    const dims = edge.dimensions ?? [];

    for (const fromInstance of fromInstances) {
      for (const toInstance of toInstances) {
        if (!dimensionsMatch(fromInstance.index, toInstance.index, dims)) {
          continue;
        }
        plannedEdges.push({
          from: fromInstance.key,
          to: toInstance.key,
          fromRef: fromInstance.ref,
          toRef: toInstance.ref,
          dimensions: dims,
          note: edge.note,
        });
        activeNodeIds.add(fromInstance.key);
        activeNodeIds.add(toInstance.key);
      }
    }
  }

  const plannedNodes = allInstances.map((instance) => ({
    ...instance,
    active: activeNodeIds.has(instance.key),
  }));

  return {
    config,
    nodes: plannedNodes,
    edges: plannedEdges,
  };
}

function validateEdges(blueprint: BlueprintGraphData): void {
  const nodeMap = new Map<string, BlueprintNode>();
  for (const node of blueprint.nodes) {
    const key = refKey(node.ref);
    if (nodeMap.has(key)) {
      const existing = nodeMap.get(key)!;
      if (existing.cardinality !== node.cardinality) {
        throw new Error(
          `Conflicting cardinality for node ${key}: ${existing.cardinality} vs ${node.cardinality}`,
        );
      }
    } else {
      nodeMap.set(key, node);
    }
  }

  for (const edge of blueprint.edges) {
    const fromKey = refKey(edge.from);
    const toKey = refKey(edge.to);
    if (!nodeMap.has(fromKey)) {
      throw new Error(`Edge references unknown source node ${fromKey}`);
    }
    if (!nodeMap.has(toKey)) {
      throw new Error(`Edge references unknown target node ${toKey}`);
    }

    if (edge.dimensions && edge.dimensions.length > 0) {
      const fromNode = nodeMap.get(fromKey)!;
      const toNode = nodeMap.get(toKey)!;
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
}

function expandNodeInstances(
  node: BlueprintNode,
  config: BlueprintExpansionConfig,
): PlannedNodeInstance[] {
  const indices = buildIndices(node.cardinality, config);
  return indices.map((index) => ({
    key: formatInstanceKey(node.ref, index),
    ref: node.ref,
    cardinality: node.cardinality,
    index,
    active: false,
    label: node.label,
    description: node.description,
  }));
}

function buildIndices(
  cardinality: CardinalityTag,
  config: BlueprintExpansionConfig,
): NodeInstanceIndex[] {
  const segmentCount = Math.trunc(config.segmentCount);

  if (cardinality === 'single') {
    return [{}];
  }

  if (segmentCount <= 0) {
    throw new Error('segmentCount must be positive for generation planning');
  }

  if (cardinality === 'perSegment') {
    return Array.from({ length: segmentCount }, (_, segment) => ({ segment }));
  }

  if (cardinality === 'perSegmentImage') {
    const combos: NodeInstanceIndex[] = [];
    const imageCount = Math.trunc(config.imagesPerSegment);
    if (imageCount <= 0) {
      throw new Error('imagesPerSegment must be positive for generation planning');
    }
    for (let segment = 0; segment < segmentCount; segment += 1) {
      for (let image = 0; image < imageCount; image += 1) {
        combos.push({ segment, image });
      }
    }
    return combos;
  }

  const exhaustive: never = cardinality;
  throw new Error(`Unhandled cardinality ${exhaustive}`);
}

function dimensionsMatch(
  fromIndex: NodeInstanceIndex,
  toIndex: NodeInstanceIndex,
  dims: CardinalityDimension[],
): boolean {
  if (dims.length === 0) {
    return true;
  }

  for (const dim of dims) {
    const fromValue = fromIndex[dim];
    const toValue = toIndex[dim];

    if (fromValue === undefined || toValue === undefined) {
      continue;
    }
    if (fromValue !== toValue) {
      return false;
    }
  }

  return true;
}

const refKey = (ref: BlueprintNodeRef): string => `${ref.kind}:${ref.id}`;

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

function formatInstanceKey(
  ref: BlueprintNodeRef,
  index: NodeInstanceIndex,
): string {
  const suffix = formatIndexSuffix(index);
  return suffix ? `${refKey(ref)}[${suffix}]` : refKey(ref);
}

function formatIndexSuffix(index: NodeInstanceIndex): string {
  const parts: string[] = [];
  if (typeof index.segment === 'number') {
    parts.push(`segment=${index.segment}`);
  }
  if (typeof index.image === 'number') {
    parts.push(`image=${index.image}`);
  }
  return parts.join('][');
}
