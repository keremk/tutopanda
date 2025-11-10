import { describe, expect, it } from 'vitest';
import type { Blueprint } from '../types.js';
import { flattenBlueprint } from './flattener.js';

const imagePromptBlueprint: Blueprint = {
  meta: {
    id: 'ImagePromptGeneration',
    name: 'Image prompt generator',
  },
  inputs: [],
  outputs: [],
  subBlueprints: [],
  nodes: [
    { ref: { kind: 'InputSource', id: 'NarrativeText' }, cardinality: 'perSegment' },
    { ref: { kind: 'Producer', id: 'ImagePromptProducer' }, cardinality: 'perSegment' },
    { ref: { kind: 'Artifact', id: 'ImagePrompt' }, cardinality: 'perSegment' },
  ],
  edges: [
    { from: 'NarrativeText', to: 'ImagePromptProducer', dimensions: ['segment'] },
    { from: 'ImagePromptProducer', to: 'ImagePrompt', dimensions: ['segment'] },
  ],
  producers: [],
};

describe('flattenBlueprint', () => {
  it('resolves string refs using the actual node kinds instead of heuristics', () => {
    const parent: Blueprint = {
      meta: { id: 'ImageOnly', name: 'Image only' },
      inputs: [],
      outputs: [],
      subBlueprints: [
        {
          id: 'ImagePromptGeneration',
          blueprintId: 'ImagePromptGeneration',
        },
      ],
      nodes: [
        { ref: { kind: 'InputSource', id: 'StorySeed' }, cardinality: 'single' },
        { ref: { kind: 'Artifact', id: 'NarrativeText' }, cardinality: 'perSegment' },
        { ref: { kind: 'Artifact', id: 'SegmentImage' }, cardinality: 'perSegment' },
      ],
      edges: [
        { from: { kind: 'InputSource', id: 'StorySeed' }, to: { kind: 'Artifact', id: 'NarrativeText' } },
        { from: 'NarrativeText', to: 'ImagePromptGeneration.NarrativeText', dimensions: ['segment'] },
        { from: 'ImagePromptGeneration.ImagePrompt', to: { kind: 'Artifact', id: 'SegmentImage' }, dimensions: ['segment'] },
      ],
      producers: [],
    };

    expect(() => {
      flattenBlueprint(parent, new Map([[imagePromptBlueprint.meta.id, imagePromptBlueprint]]));
    }).not.toThrow();
  });

  it('still throws when parent edges reference missing nodes', () => {
    const parent: Blueprint = {
      meta: { id: 'Broken', name: 'Broken' },
      inputs: [],
      outputs: [],
      subBlueprints: [],
      nodes: [{ ref: { kind: 'InputSource', id: 'InputA' }, cardinality: 'single' }],
      edges: [{ from: 'InputA', to: 'MissingProducer' }],
      producers: [],
    };

    expect(() => flattenBlueprint(parent, new Map())).toThrow(/unknown node/i);
  });
});
