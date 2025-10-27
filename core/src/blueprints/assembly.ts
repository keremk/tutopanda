import type { BlueprintSection } from '../types.js';
import {
  artifactRef,
  edge,
  inputRef,
  node,
  producerRef,
  segmentDim,
} from './helpers.js';

export const assemblySection: BlueprintSection = {
  id: 'assembly',
  label: 'Timeline Assembly',
  nodes: [
    node(inputRef('UseVideo'), 'single'),
    node(inputRef('AssemblyStrategy'), 'single'),
    node(inputRef('SegmentAnimations'), 'perSegment'),
    node(producerRef('TimelineAssembler'), 'single'),
    node(artifactRef('FinalVideo'), 'single'),
  ],
  edges: [
    edge(inputRef('UseVideo'), producerRef('TimelineAssembler')),
    edge(inputRef('AssemblyStrategy'), producerRef('TimelineAssembler')),
    edge(inputRef('SegmentAnimations'), producerRef('TimelineAssembler'), {
      dimensions: segmentDim,
    }),
    edge(producerRef('TimelineAssembler'), artifactRef('FinalVideo')),
  ],
};
