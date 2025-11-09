import { describe, expect, it } from 'vitest';
import { expandBlueprint, type BlueprintGraphData } from './blueprints.js';

const BASE_GRAPH: BlueprintGraphData = {
  nodes: [
    { ref: { kind: 'InputSource', id: 'InquiryPrompt' }, cardinality: 'single' },
    { ref: { kind: 'Producer', id: 'ScriptProducer' }, cardinality: 'single' },
    { ref: { kind: 'Artifact', id: 'NarrationScript' }, cardinality: 'perSegment' },
    { ref: { kind: 'Producer', id: 'AudioProducer' }, cardinality: 'perSegment' },
    { ref: { kind: 'Artifact', id: 'SegmentAudio' }, cardinality: 'perSegment' },
  ],
  edges: [
    {
      from: { kind: 'InputSource', id: 'InquiryPrompt' },
      to: { kind: 'Producer', id: 'ScriptProducer' },
    },
    {
      from: { kind: 'Producer', id: 'ScriptProducer' },
      to: { kind: 'Artifact', id: 'NarrationScript' },
      dimensions: ['segment'],
    },
    {
      from: { kind: 'Artifact', id: 'NarrationScript' },
      to: { kind: 'Producer', id: 'AudioProducer' },
      dimensions: ['segment'],
    },
    {
      from: { kind: 'Producer', id: 'AudioProducer' },
      to: { kind: 'Artifact', id: 'SegmentAudio' },
      dimensions: ['segment'],
    },
  ],
};

describe('expandBlueprint', () => {
  it('expands per-segment nodes using the provided segment count', () => {
    const expanded = expandBlueprint(
      { segmentCount: 3, imagesPerSegment: 2 },
      BASE_GRAPH,
    );

    const narrationNodes = expanded.nodes.filter(
      (node) => node.ref.kind === 'Artifact' && node.ref.id === 'NarrationScript',
    );

    expect(narrationNodes).toHaveLength(3);
    expect(narrationNodes.every((node) => typeof node.index.segment === 'number')).toBe(true);
  });

  it('connects edges only when dimensions match', () => {
    const expanded = expandBlueprint(
      { segmentCount: 2, imagesPerSegment: 2 },
      BASE_GRAPH,
    );

    const edges = expanded.edges.filter(
      (edge) => edge.fromRef.id === 'NarrationScript' && edge.toRef.id === 'AudioProducer',
    );

    expect(edges).toHaveLength(2);
    expect(
      edges.every((edge) => edge.dimensions.length === 1 && edge.dimensions[0] === 'segment'),
    ).toBe(true);
  });

  it('fails when edges reference unknown nodes', () => {
    const invalidGraph: BlueprintGraphData = {
      nodes: BASE_GRAPH.nodes,
      edges: [
        {
          from: { kind: 'Artifact', id: 'Missing' },
          to: { kind: 'Artifact', id: 'SegmentAudio' },
        },
      ],
    };

    expect(() =>
      expandBlueprint({ segmentCount: 1, imagesPerSegment: 1 }, invalidGraph),
    ).toThrow(/unknown source/);
  });

  it('expands per-segment-image nodes based on imagesPerSegment', () => {
    const graph: BlueprintGraphData = {
      nodes: [
        {
          ref: { kind: 'Artifact', id: 'SegmentImage' },
          cardinality: 'perSegmentImage',
        },
      ],
      edges: [],
    };

    const expanded = expandBlueprint({ segmentCount: 2, imagesPerSegment: 3 }, graph);
    const imageNodes = expanded.nodes.filter((node) => node.ref.id === 'SegmentImage');

    expect(imageNodes).toHaveLength(6);
    expect(
      imageNodes.every(
        (node) =>
          typeof node.index.segment === 'number' && typeof node.index.image === 'number',
      ),
    ).toBe(true);
  });
});
