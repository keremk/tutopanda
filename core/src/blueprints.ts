import type {
  BlueprintEdge,
  BlueprintNode,
  BlueprintNodeRef,
  BlueprintExpansionConfig,
  CardinalityDimension,
  CardinalityTag,
  Condition,
  ConditionKey,
  ConditionalValue,
  GraphBlueprint,
} from './types.js';
import { generationBlueprint } from './blueprints/index.js';

// Re-export for backward compatibility
export type { BlueprintExpansionConfig };

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

export interface FlattenedBlueprint {
  nodes: BlueprintNode[];
  edges: BlueprintEdge[];
}

export const flattenBlueprint = (
  blueprint: GraphBlueprint = generationBlueprint,
): FlattenedBlueprint => {
  const uniqueNodes = new Map<string, BlueprintNode>();
  const edges: BlueprintEdge[] = [];

  for (const section of blueprint.sections) {
    for (const node of section.nodes) {
      const key = refKey(node.ref);
      const seen = uniqueNodes.get(key);
      if (seen) {
        if (seen.cardinality !== node.cardinality) {
          throw new Error(
            `Conflicting cardinality for node ${key}: ${seen.cardinality} vs ${node.cardinality}`,
          );
        }
        mergeNodeConditions(seen, node.when);
        continue;
      }
      uniqueNodes.set(key, { ...node, when: cloneConditions(node.when) });
    }
    edges.push(...section.edges);
  }

  for (const edge of edges) {
    const fromKey = refKey(edge.from);
    const toKey = refKey(edge.to);
    if (!uniqueNodes.has(fromKey)) {
      throw new Error(`Edge references unknown source node ${fromKey}`);
    }
    if (!uniqueNodes.has(toKey)) {
      throw new Error(`Edge references unknown target node ${toKey}`);
    }

    if (edge.dimensions && edge.dimensions.length > 0) {
      const fromNode = uniqueNodes.get(fromKey)!;
      const toNode = uniqueNodes.get(toKey)!;
      const allowed = new Set<
        CardinalityDimension
      >([
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
    edges,
  };
};

export const expandBlueprint = (
  config: BlueprintExpansionConfig,
  blueprint: GraphBlueprint = generationBlueprint,
): ExpandedBlueprint => {
  const { nodes, edges } = flattenBlueprint(blueprint);

  const instanceMap = new Map<string, PlannedNodeInstance[]>();
  const allInstances: PlannedNodeInstance[] = [];

  for (const node of nodes) {
    const instances = expandNodeInstances(node, config);
    if (instances.length === 0) {
      continue;
    }
    instanceMap.set(refKey(node.ref), instances);
    allInstances.push(...instances);
  }

  const plannedEdges: PlannedEdgeInstance[] = [];
  const activeNodeIds = new Set<string>();

  for (const edge of edges) {
    const fromInstances = instanceMap.get(refKey(edge.from)) ?? [];
    const toInstances = instanceMap.get(refKey(edge.to)) ?? [];
    const dims = edge.dimensions ?? [];

    for (const fromInstance of fromInstances) {
      for (const toInstance of toInstances) {
        if (!dimensionsMatch(fromInstance.index, toInstance.index, dims)) {
          continue;
        }
        if (!evaluateConditionGroups(edge.when, config, fromInstance.index, toInstance.index)) {
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
};

const expandNodeInstances = (
  node: BlueprintNode,
  config: BlueprintExpansionConfig,
): PlannedNodeInstance[] => {
  const indices = buildIndices(node.cardinality, config);
  const filtered = indices.filter((index) =>
    evaluateConditionGroups(node.when, config, index, index),
  );
  return filtered.map((index) => ({
    key: formatInstanceKey(node.ref, index),
    ref: node.ref,
    cardinality: node.cardinality,
    index,
    active: false,
    label: node.label,
    description: node.description,
  }));
};

const buildIndices = (
  cardinality: CardinalityTag,
  config: BlueprintExpansionConfig,
): NodeInstanceIndex[] => {
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
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const segmentUsesVideo = resolveConditionValue(config, 'useVideo', segment);
      if (segmentUsesVideo) {
        continue;
      }
      if (imageCount <= 0) {
        throw new Error('imagesPerSegment must be positive when useVideo=false for any segment');
      }
      for (let image = 0; image < imageCount; image += 1) {
        combos.push({ segment, image });
      }
    }
    return combos;
  }

  const exhaustive: never = cardinality;
  throw new Error(`Unhandled cardinality ${exhaustive}`);
};

const resolveConditionValue = (
  config: BlueprintExpansionConfig,
  key: ConditionKey,
  segmentIndex: number | undefined,
): boolean => {
  const raw = (config as Record<ConditionKey, ConditionalValue>)[key];
  if (raw === undefined) {
    throw new Error(`Missing conditional value for ${key}`);
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return false;
    }

    if (segmentIndex === undefined) {
      return raw[0] ?? false;
    }

    if (segmentIndex >= 0 && segmentIndex < raw.length) {
      return raw[segmentIndex] ?? false;
    }

    const fallback = raw[raw.length - 1];
    return fallback ?? raw[0] ?? false;
  }

  return raw;
};

const evaluateConditionGroups = (
  groups: Condition[][] | Condition[] | undefined,
  config: BlueprintExpansionConfig,
  fromIndex: NodeInstanceIndex,
  toIndex: NodeInstanceIndex,
): boolean => {
  const normalized = normalizeGroups(groups);
  if (!normalized || normalized.length === 0) {
    return true;
  }

  const segment = pickSegmentIndex(fromIndex, toIndex);

  return normalized.some((group) =>
    group.every((condition) => {
      const value = resolveConditionValue(config, condition.key, segment);
      return value === condition.equals;
    }),
  );
};

const pickSegmentIndex = (
  fromIndex: NodeInstanceIndex,
  toIndex: NodeInstanceIndex,
): number | undefined => {
  if (typeof fromIndex.segment === 'number') {
    return fromIndex.segment;
  }
  if (typeof toIndex.segment === 'number') {
    return toIndex.segment;
  }
  return undefined;
};

const dimensionsMatch = (
  fromIndex: NodeInstanceIndex,
  toIndex: NodeInstanceIndex,
  dims: CardinalityDimension[],
): boolean => {
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
};

const refKey = (ref: BlueprintNodeRef): string => `${ref.kind}:${ref.id}`;

const cardinalityDimensionsFor = (cardinality: CardinalityTag): CardinalityDimension[] => {
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
};

const normalizeGroups = (
  value?: Condition[][] | Condition[],
): Condition[][] | undefined => {
  if (!value) {
    return undefined;
  }
  if (value.length === 0) {
    return [];
  }
  if (Array.isArray(value[0])) {
    return (value as Condition[][]).map((group) => group.slice());
  }
  return [(value as Condition[]).slice()];
};

const cloneConditions = (conditions?: Condition[][]): Condition[][] | undefined => {
  return conditions
    ? conditions.map((group) => group.map((condition) => ({ ...condition })))
    : undefined;
};

const mergeNodeConditions = (
  target: BlueprintNode,
  incoming?: Condition[][],
): void => {
  if (!incoming || incoming.length === 0) {
    return;
  }
  if (!target.when || target.when.length === 0) {
    target.when = cloneConditions(incoming);
    return;
  }

  target.when = mergeConditionGroups(target.when, incoming);
};

const mergeConditionGroups = (
  existing: Condition[][],
  incoming: Condition[][],
): Condition[][] => {
  const merged = existing.map((group) => group.map((condition) => ({ ...condition })));
  for (const group of incoming) {
    if (!merged.some((candidate) => conditionGroupsEqual(candidate, group))) {
      merged.push(group.map((condition) => ({ ...condition })));
    }
  }
  return merged;
};

const conditionGroupsEqual = (a: Condition[], b: Condition[]): boolean => {
  if (a.length !== b.length) {
    return false;
  }
  return a.every((condition) =>
    b.some((other) => other.key === condition.key && other.equals === condition.equals),
  );
};

const formatInstanceKey = (
  ref: BlueprintNodeRef,
  index: NodeInstanceIndex,
): string => {
  const suffix = formatIndexSuffix(index);
  return suffix ? `${refKey(ref)}[${suffix}]` : refKey(ref);
};

const formatIndexSuffix = (index: NodeInstanceIndex): string => {
  const parts: string[] = [];
  if (typeof index.segment === 'number') {
    parts.push(`segment=${index.segment}`);
  }
  if (typeof index.image === 'number') {
    parts.push(`image=${index.image}`);
  }
  return parts.join('&');
};
