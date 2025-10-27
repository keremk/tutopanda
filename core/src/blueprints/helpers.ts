import type {
  ArtifactKind,
  BlueprintEdge,
  BlueprintNode,
  BlueprintNodeRef,
  CardinalityDimension,
  CardinalityTag,
  Condition,
  InputSourceKind,
  NodeKind,
  ProducerKind,
} from '../types.js';

export const segmentDim: CardinalityDimension[] = ['segment'];
export const segmentImageDims: CardinalityDimension[] = ['segment', 'image'];

export const useImagesOnly: Condition[] = [{ key: 'useVideo', equals: false }];
export const textVideoOnly: Condition[] = [
  { key: 'useVideo', equals: true },
  { key: 'isImageToVideo', equals: false },
];
export const imageVideoOnly: Condition[] = [
  { key: 'useVideo', equals: true },
  { key: 'isImageToVideo', equals: true },
];

export const inputRef = (id: InputSourceKind): BlueprintNodeRef<'InputSource'> => ({
  kind: 'InputSource',
  id,
});

export const producerRef = (id: ProducerKind): BlueprintNodeRef<'Producer'> => ({
  kind: 'Producer',
  id,
});

export const artifactRef = (id: ArtifactKind): BlueprintNodeRef<'Artifact'> => ({
  kind: 'Artifact',
  id,
});

interface NodeOptions {
  label?: string;
  description?: string;
  when?: Condition[] | Condition[][];
}

export const node = <K extends NodeKind>(
  ref: BlueprintNodeRef<K>,
  cardinality: CardinalityTag,
  options: NodeOptions = {},
): BlueprintNode<K> => ({
  ref,
  cardinality,
  ...options,
  when: normalizeConditionGroups(options.when),
});

const normalizeConditionGroups = (
  value?: Condition[] | Condition[][],
): Condition[][] | undefined => {
  if (!value) {
    return undefined;
  }
  if (Array.isArray(value) && value.length > 0 && Array.isArray(value[0])) {
    return (value as Condition[][]).map((group) => group.slice());
  }
  return [ (value as Condition[]).slice() ];
};

interface EdgeOptions {
  dimensions?: CardinalityDimension[];
  when?: Condition[];
  note?: string;
}

export const edge = (
  from: BlueprintNodeRef,
  to: BlueprintNodeRef,
  options: EdgeOptions = {},
): BlueprintEdge => ({
  from,
  to,
  ...options,
});
