import { describe, expect, it } from 'vitest';
import type {
  BlueprintArtefactDefinition,
  BlueprintDocument,
  BlueprintEdgeDefinition,
  BlueprintInputDefinition,
  BlueprintTreeNode,
  ProducerConfig,
  SubBlueprintDefinition,
} from '../types.js';
import { buildBlueprintGraph } from './canonical-graph.js';

describe('buildBlueprintGraph', () => {
  it('flattens nested blueprints and tracks namespace dimensions', () => {
    const bundle = createFixtureTree();
    const graph = buildBlueprintGraph(bundle);

    const producerNode = graph.nodes.find((node) => node.id.endsWith('TextToImageProducer'));
    expect(producerNode?.dimensions).toHaveLength(2);
    expect(new Set(producerNode?.dimensions ?? []).size).toBe(2);

    const artefactNode = graph.nodes.find((node) => node.id.endsWith('NarrationScript'));
    expect(artefactNode?.dimensions).toHaveLength(1);

    const promptNode = graph.nodes.find((node) => node.id.endsWith('ImagePrompt'));
    expect(promptNode?.dimensions).toHaveLength(2);
    expect(new Set(promptNode?.dimensions ?? []).size).toBe(2);

    const finalEdge = graph.edges.find((edge) => edge.to.nodeId === 'SegmentImage');
    expect(finalEdge?.from.dimensions).toHaveLength(2);
    expect(finalEdge?.to.dimensions).toHaveLength(2);

    expect(readNamespaceSymbols(graph.namespaceDimensions.get('ImageGenerator'))).toEqual(['i', 'j']);
    expect(readNamespaceSymbols(graph.namespaceDimensions.get('ImagePromptGenerator'))).toEqual(['i']);
  });
});

function readNamespaceSymbols(entries: Array<{ raw: string }> | undefined): string[] | undefined {
  return entries?.map((entry) => entry.raw);
}

function createFixtureTree(): BlueprintTreeNode {
  const scriptBlueprint = makeBlueprintDocument(
    'ScriptGenerator',
    [
      { name: 'InquiryPrompt', type: 'string', required: true },
      { name: 'NumOfSegments', type: 'int', required: true },
    ],
    [
      { name: 'NarrationScript', type: 'array', countInput: 'NumOfSegments' },
      { name: 'MovieSummary', type: 'string' },
    ],
    [
      { name: 'ScriptProducer', provider: 'openai', model: 'gpt' },
    ],
    [
      { from: 'InquiryPrompt', to: 'ScriptProducer' },
      { from: 'NumOfSegments', to: 'ScriptProducer' },
      { from: 'ScriptProducer', to: 'NarrationScript[i]' },
      { from: 'ScriptProducer', to: 'MovieSummary' },
    ],
  );

  const imagePromptBlueprint = makeBlueprintDocument(
    'ImagePromptGenerator',
    [
      { name: 'NarrativeText', type: 'string', required: true },
      { name: 'OverallSummary', type: 'string', required: true },
      { name: 'NumOfImagesPerNarrative', type: 'int', required: true },
    ],
    [
      { name: 'ImagePrompt', type: 'array', countInput: 'NumOfImagesPerNarrative' },
    ],
    [
      { name: 'ImagePromptProducer', provider: 'openai', model: 'gpt' },
    ],
    [
      { from: 'NarrativeText', to: 'ImagePromptProducer' },
      { from: 'OverallSummary', to: 'ImagePromptProducer' },
      { from: 'NumOfImagesPerNarrative', to: 'ImagePromptProducer' },
      { from: 'ImagePromptProducer', to: 'ImagePrompt[j]' },
    ],
  );

  const imageGeneratorBlueprint = makeBlueprintDocument(
    'ImageGenerator',
    [
      { name: 'Prompt', type: 'string', required: true },
      { name: 'Size', type: 'string', required: false },
    ],
    [
      { name: 'SegmentImage', type: 'image' },
    ],
    [
      { name: 'TextToImageProducer', provider: 'replicate', model: 'xyz' },
    ],
    [
      { from: 'Prompt', to: 'TextToImageProducer' },
      { from: 'Size', to: 'TextToImageProducer' },
      { from: 'TextToImageProducer', to: 'SegmentImage' },
    ],
  );

  const rootDocument = makeBlueprintDocument(
    'ImageOnly',
    [
      { name: 'InquiryPrompt', type: 'string', required: true },
      { name: 'NumOfSegments', type: 'int', required: true },
      { name: 'NumOfImagesPerNarrative', type: 'int', required: true },
      { name: 'Size', type: 'string', required: false },
    ],
    [
      { name: 'SegmentImage', type: 'array' },
    ],
    [],
    [
      { from: 'InquiryPrompt', to: 'ScriptGenerator.InquiryPrompt' },
      { from: 'NumOfSegments', to: 'ScriptGenerator.NumOfSegments' },
      { from: 'ScriptGenerator.NarrationScript[i]', to: 'ImagePromptGenerator[i].NarrativeText' },
      { from: 'ScriptGenerator.MovieSummary', to: 'ImagePromptGenerator[i].OverallSummary' },
      { from: 'NumOfImagesPerNarrative', to: 'ImagePromptGenerator[i].NumOfImagesPerNarrative' },
      { from: 'ImagePromptGenerator[i].ImagePrompt[j]', to: 'ImageGenerator[i][j].Prompt' },
      { from: 'Size', to: 'ImageGenerator[i][j].Size' },
      { from: 'ImageGenerator[i][j].SegmentImage', to: 'SegmentImage[i][j]' },
    ],
    [
      { name: 'ScriptGenerator' },
      { name: 'ImagePromptGenerator' },
      { name: 'ImageGenerator' },
    ],
  );

  return makeTreeNode(rootDocument, [], new Map<string, BlueprintTreeNode>([
    ['ScriptGenerator', makeTreeNode(scriptBlueprint, ['ScriptGenerator'])],
    ['ImagePromptGenerator', makeTreeNode(imagePromptBlueprint, ['ImagePromptGenerator'])],
    ['ImageGenerator', makeTreeNode(imageGeneratorBlueprint, ['ImageGenerator'])],
  ]));
}

function makeBlueprintDocument(
  id: string,
  inputs: BlueprintInputDefinition[],
  artefacts: BlueprintArtefactDefinition[],
  producers: ProducerConfig[],
  edges: BlueprintEdgeDefinition[],
  subBlueprints: SubBlueprintDefinition[] = [],
): BlueprintDocument {
  return {
    meta: { id, name: id },
    inputs,
    artefacts,
    producers,
    edges,
    subBlueprints,
  };
}

function makeTreeNode(
  document: BlueprintDocument,
  namespacePath: string[],
  children: Map<string, BlueprintTreeNode> = new Map(),
): BlueprintTreeNode {
  return {
    id: document.meta.id,
    namespacePath,
    document,
    children,
  };
}
