import { describe, expect, it } from 'vitest';

import type { ArtifactKind, NodeKind, ProducerKind } from './types.js';
import {
  expandBlueprint,
  type BlueprintExpansionConfig,
} from './blueprints.js';

const baseConfig: BlueprintExpansionConfig = {
  segmentCount: 3,
  imagesPerSegment: 2,
  useVideo: false,
  isImageToVideo: false,
};

const expand = (overrides: Partial<BlueprintExpansionConfig> = {}) =>
  expandBlueprint({ ...baseConfig, ...overrides });

const nodeIndexes = (
  nodes: ReturnType<typeof expand>['nodes'],
  kind: NodeKind,
  id: ArtifactKind | ProducerKind | string
) =>
  nodes
    .filter((node) => node.ref.kind === kind && node.ref.id === id)
    .map((node) => node.index);

const activeIndexes = (
  nodes: ReturnType<typeof expand>['nodes'],
  kind: NodeKind,
  id: ArtifactKind | ProducerKind | string
) =>
  nodes
    .filter(
      (node) => node.ref.kind === kind && node.ref.id === id && node.active
    )
    .map((node) => node.index);

const edgeCount = (
  edges: ReturnType<typeof expand>['edges'],
  fromKind: NodeKind,
  fromId: ArtifactKind | ProducerKind | string
) =>
  edges.filter(
    (edge) => edge.fromRef.kind === fromKind && edge.fromRef.id === fromId
  ).length;

const refKey = (ref: { kind: NodeKind; id: string }) => `${ref.kind}:${ref.id}`;

const activeNodeCountMap = (nodes: ReturnType<typeof expand>['nodes']) => {
  const counts = new Map<string, number>();
  for (const node of nodes) {
    if (!node.active) {
      continue;
    }
    const key = refKey(node.ref);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const edgeCountMap = (edges: ReturnType<typeof expand>['edges']) => {
  const counts = new Map<string, number>();
  for (const edge of edges) {
    const key = `${refKey(edge.fromRef)}->${refKey(edge.toRef)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const countFor = (counts: Map<string, number>, key: string) =>
  counts.get(key) ?? 0;

describe('expandBlueprint', () => {
  it('spawns image pipeline for all segments when useVideo=false', () => {
    const result = expand();

    expect(nodeIndexes(result.nodes, 'Artifact', 'SegmentImage')).toHaveLength(
      6
    );
    expect(
      activeIndexes(result.nodes, 'Artifact', 'SegmentImage')
    ).toHaveLength(6);
    expect(edgeCount(result.edges, 'Artifact', 'SegmentImage')).toBe(6);
    expect(nodeIndexes(result.nodes, 'Artifact', 'SegmentVideo')).toHaveLength(
      0
    );
  });

  it('supports single segment image generation', () => {
    const result = expand({ segmentCount: 1, imagesPerSegment: 1 });

    expect(nodeIndexes(result.nodes, 'Artifact', 'SegmentImage')).toEqual([
      { segment: 0, image: 0 },
    ]);
  });

  it('activates text-to-video lane when useVideo=true and isImageToVideo=false', () => {
    const result = expand({ useVideo: true, isImageToVideo: false });

    expect(
      nodeIndexes(result.nodes, 'Producer', 'TextToVideoProducer')
    ).toHaveLength(3);
    expect(edgeCount(result.edges, 'Artifact', 'SegmentVideo')).toBe(3);
    expect(nodeIndexes(result.nodes, 'Artifact', 'SegmentImage')).toHaveLength(
      0
    );
  });

  it('mixes image and video lanes per segment overrides', () => {
    const result = expand({
      useVideo: [false, true, true],
      isImageToVideo: [false, false, true],
    });

    // Segment 0 → images
    expect(nodeIndexes(result.nodes, 'Artifact', 'SegmentImage')).toEqual([
      { segment: 0, image: 0 },
      { segment: 0, image: 1 },
    ]);
    expect(edgeCount(result.edges, 'Artifact', 'SegmentImage')).toBe(2);

    // Segment 1 → text-to-video
    expect(
      nodeIndexes(result.nodes, 'Producer', 'TextToVideoProducer')
    ).toEqual([{ segment: 1 }]);

    // Segment 2 → image-to-video
    expect(
      nodeIndexes(result.nodes, 'Producer', 'ImageToVideoProducer')
    ).toEqual([{ segment: 2 }]);

    // Segment videos produced only for segments 1 & 2
    expect(nodeIndexes(result.nodes, 'Artifact', 'SegmentVideo')).toEqual([
      { segment: 1 },
      { segment: 2 },
    ]);
  });

  it('ignores image count when every segment uses video', () => {
    const result = expand({ useVideo: true, imagesPerSegment: 0 });

    expect(nodeIndexes(result.nodes, 'Artifact', 'SegmentImage')).toHaveLength(
      0
    );
    expect(nodeIndexes(result.nodes, 'Artifact', 'SegmentVideo')).toHaveLength(
      3
    );
  });

  it('throws when segmentCount is zero', () => {
    expect(() => expand({ segmentCount: 0 })).toThrow(/segmentCount/);
  });

  it('throws when imagesPerSegment is zero for an image segment', () => {
    expect(() =>
      expand({ imagesPerSegment: 0, useVideo: [false, true, true] })
    ).toThrow(/imagesPerSegment/);
  });
});

describe('expandBlueprint final graph snapshots', () => {
  const baseGraphConfig: BlueprintExpansionConfig = {
    segmentCount: 2,
    imagesPerSegment: 2,
    useVideo: false,
    isImageToVideo: false,
  };

  it('builds a pure image graph', () => {
    const result = expandBlueprint(baseGraphConfig);
    const nodes = activeNodeCountMap(result.nodes);
    const edges = edgeCountMap(result.edges);

    expect(countFor(nodes, 'Artifact:SegmentImage')).toBe(4);
    expect(countFor(nodes, 'Producer:TextToImageProducer')).toBe(4);
    expect(countFor(nodes, 'Producer:TextToVideoProducer')).toBe(0);
    expect(countFor(nodes, 'Artifact:SegmentVideo')).toBe(0);

    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:TextToImagePromptProducer'
      )
    ).toBe(2);
    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:TextToVideoPromptProducer'
      )
    ).toBe(0);
    expect(
      countFor(edges, 'Artifact:SegmentImage->Producer:TimelineAssembler')
    ).toBe(4);
    expect(
      countFor(edges, 'Artifact:SegmentVideo->Producer:TimelineAssembler')
    ).toBe(0);
  });

  it('builds a text-to-video graph', () => {
    const result = expandBlueprint({
      ...baseGraphConfig,
      useVideo: true,
      isImageToVideo: false,
    });
    const nodes = activeNodeCountMap(result.nodes);
    const edges = edgeCountMap(result.edges);

    expect(countFor(nodes, 'Producer:TextToVideoProducer')).toBe(2);
    expect(countFor(nodes, 'Artifact:SegmentVideo')).toBe(2);
    expect(countFor(nodes, 'Artifact:SegmentImage')).toBe(0);

    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:TextToVideoPromptProducer'
      )
    ).toBe(2);
    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:ImageToVideoPromptProducer'
      )
    ).toBe(0);
    expect(
      countFor(edges, 'Artifact:SegmentVideo->Producer:TimelineAssembler')
    ).toBe(2);
    expect(
      countFor(edges, 'Artifact:SegmentImage->Producer:TimelineAssembler')
    ).toBe(0);
  });

  it('builds an image-to-video graph', () => {
    const result = expandBlueprint({
      ...baseGraphConfig,
      useVideo: true,
      isImageToVideo: true,
    });
    const nodes = activeNodeCountMap(result.nodes);
    const edges = edgeCountMap(result.edges);

    expect(countFor(nodes, 'Producer:ImageToVideoProducer')).toBe(2);
    expect(countFor(nodes, 'Producer:StartImageProducer')).toBe(2);
    expect(countFor(nodes, 'Artifact:SegmentVideo')).toBe(2);
    expect(countFor(nodes, 'Artifact:SegmentImage')).toBe(0);
    expect(countFor(nodes, 'Producer:TextToVideoProducer')).toBe(0);

    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:ImageToVideoPromptProducer'
      )
    ).toBe(2);
    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:TextToVideoPromptProducer'
      )
    ).toBe(0);
    expect(
      countFor(edges, 'Artifact:SegmentVideo->Producer:TimelineAssembler')
    ).toBe(2);
    expect(
      countFor(edges, 'Artifact:SegmentImage->Producer:TimelineAssembler')
    ).toBe(0);
    expect(
      countFor(edges, 'Artifact:StartImage->Producer:ImageToVideoProducer')
    ).toBe(2);
  });

  it('builds a mixed per-segment graph', () => {
    const result = expandBlueprint({
      ...baseGraphConfig,
      useVideo: [false, true],
      isImageToVideo: [false, true],
    });
    const nodes = activeNodeCountMap(result.nodes);
    const edges = edgeCountMap(result.edges);

    expect(countFor(nodes, 'Artifact:SegmentImage')).toBe(2);
    expect(countFor(nodes, 'Artifact:SegmentVideo')).toBe(1);
    expect(countFor(nodes, 'Producer:TextToVideoProducer')).toBe(0);
    expect(countFor(nodes, 'Producer:ImageToVideoProducer')).toBe(1);
    expect(countFor(nodes, 'Producer:TextToImagePromptProducer')).toBe(1);

    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:TextToImagePromptProducer'
      )
    ).toBe(1);
    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:ImageToVideoPromptProducer'
      )
    ).toBe(1);
    expect(
      countFor(
        edges,
        'Artifact:NarrationScript->Producer:TextToVideoPromptProducer'
      )
    ).toBe(0);
    expect(
      countFor(edges, 'Artifact:SegmentImage->Producer:TimelineAssembler')
    ).toBe(2);
    expect(
      countFor(edges, 'Artifact:SegmentVideo->Producer:TimelineAssembler')
    ).toBe(1);
  });
});
