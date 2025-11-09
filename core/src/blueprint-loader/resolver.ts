import type {
  BlueprintNodeRef,
  BlueprintEdge,
  UnresolvedBlueprintEdge,
  SubBlueprintRef,
  NodeKind,
} from '../types.js';

/**
 * Parsed node reference that may include a sub-blueprint namespace.
 */
export interface ParsedNodeRef {
  subBlueprintId?: string;  // If present, this is a sub-blueprint node reference
  nodeId: string;           // The actual node ID
  fullId: string;           // Full ID including namespace (e.g., "ScriptGeneration.NarrationScript")
}

/**
 * Parse a node reference string that may use dot notation.
 *
 * Examples:
 *   "InquiryPrompt" → { nodeId: "InquiryPrompt", fullId: "InquiryPrompt" }
 *   "ScriptGeneration.NarrationScript" → { subBlueprintId: "ScriptGeneration", nodeId: "NarrationScript", fullId: "ScriptGeneration.NarrationScript" }
 */
export function parseNodeRefString(ref: string): ParsedNodeRef {
  if (!ref.includes('.')) {
    return {
      nodeId: ref,
      fullId: ref,
    };
  }

  const [subBlueprintId, nodeId] = ref.split('.');
  if (!subBlueprintId || !nodeId) {
    throw new Error(`Invalid node reference format: "${ref}". Expected "SubBlueprintId.NodeId"`);
  }

  return {
    subBlueprintId,
    nodeId,
    fullId: ref,
  };
}

/**
 * Prefix a node reference with a sub-blueprint namespace.
 *
 * Examples:
 *   prefixNodeRef({ kind: "Artifact", id: "NarrationScript" }, "ScriptGeneration")
 *   → { kind: "Artifact", id: "ScriptGeneration.NarrationScript" }
 */
export function prefixNodeRef(
  ref: BlueprintNodeRef,
  namespace: string,
): BlueprintNodeRef {
  return {
    kind: ref.kind,
    id: `${namespace}.${ref.id}`,
  };
}

/**
 * Resolve an edge reference (string or BlueprintNodeRef) into a qualified BlueprintNodeRef.
 *
 * @param ref - The reference to resolve (can be a string with dot notation or a BlueprintNodeRef)
 * @param subBlueprints - Map of sub-blueprint IDs for validation
 * @param detectKind - Function to detect the node kind from the node ID
 */
export function resolveEdgeRef(
  ref: string | BlueprintNodeRef,
  subBlueprints: SubBlueprintRef[],
  detectKind: (nodeId: string) => NodeKind,
): BlueprintNodeRef {
  // If already a BlueprintNodeRef, return as is
  if (typeof ref === 'object') {
    return ref;
  }

  // Parse the string reference
  const parsed = parseNodeRefString(ref);

  // If it references a sub-blueprint, validate it exists
  if (parsed.subBlueprintId) {
    const subBlueprint = subBlueprints.find(sub => sub.id === parsed.subBlueprintId);
    if (!subBlueprint) {
      throw new Error(
        `Edge references unknown sub-blueprint: "${parsed.subBlueprintId}" in "${ref}"`
      );
    }
  }

  // Detect the node kind from the node ID (last part after dot)
  const kind = detectKind(parsed.nodeId);

  if (kind === 'InputSource') {
    return {
      kind,
      id: parsed.nodeId,
    };
  }

  return {
    kind,
    id: parsed.fullId,
  };
}

/**
 * Detect the node kind from a node ID by checking against known types.
 * This is a heuristic - ideally we'd look it up in the blueprint.
 */
export function detectNodeKind(nodeId: string): NodeKind {
  // Common input source patterns
  const inputSources = [
    'InquiryPrompt', 'Duration', 'Audience', 'Language',
    'MusicPromptInput', 'SegmentNarrationInput',
    'VoiceId', 'Emotion',
    'ImagesPerSegment',
    'SegmentImagePromptInput', 'ImageStyle',
    'Size', 'AspectRatio',
    'StartingImagePromptInput', 'MovieDirectionPromptInput',
    'AssemblyStrategy', 'SegmentAnimations',
    'TextInput', 'NumOfSegments', // Added for sub-blueprints
  ];

  // Common producer patterns
  const producers = [
    'ScriptProducer',
    'TextToMusicPromptProducer', 'TextToMusicProducer',
    'AudioProducer',
    'TextToImagePromptProducer', 'TextToImageProducer',
    'TextToVideoPromptProducer', 'TextToVideoProducer',
    'ImageToVideoPromptProducer', 'StartImageProducer', 'ImageToVideoProducer',
    'TimelineAssembler',
  ];

  if (inputSources.includes(nodeId)) {
    return 'InputSource';
  }

  if (producers.includes(nodeId)) {
    return 'Producer';
  }

  // Default to Artifact for outputs
  return 'Artifact';
}

/**
 * Resolve all edges in a blueprint, converting string references to BlueprintNodeRef.
 */
export function resolveEdges(
  edges: UnresolvedBlueprintEdge[],
  subBlueprints: SubBlueprintRef[],
): BlueprintEdge[] {
  return edges.map(edge => ({
    from: resolveEdgeRef(edge.from, subBlueprints, detectNodeKind),
    to: resolveEdgeRef(edge.to, subBlueprints, detectNodeKind),
    dimensions: edge.dimensions,
    note: edge.note,
  }));
}
