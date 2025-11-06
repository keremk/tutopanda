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

  inputs: [
    {
      name: 'useVideo',
      ref: inputRef('UseVideo'),
      cardinality: 'single',
      required: false,
      description: 'Whether to include video',
    },
    {
      name: 'assemblyStrategy',
      ref: inputRef('AssemblyStrategy'),
      cardinality: 'single',
      required: false,
      description: 'Strategy for assembling the timeline',
    },
    {
      name: 'segmentAnimations',
      ref: inputRef('SegmentAnimations'),
      cardinality: 'perSegment',
      required: false,
      description: 'Animation settings for each segment',
    },
    {
      name: 'segmentAudio',
      ref: artifactRef('SegmentAudio'),
      cardinality: 'perSegment',
      required: true,
      description: 'Audio tracks for each segment',
    },
    {
      name: 'segmentVideo',
      ref: artifactRef('SegmentVideo'),
      cardinality: 'perSegment',
      required: false,
      description: 'Video clips for each segment',
    },
    {
      name: 'musicTrack',
      ref: artifactRef('MusicTrack'),
      cardinality: 'single',
      required: false,
      description: 'Background music track',
    },
  ],

  outputs: [
    {
      name: 'finalVideo',
      ref: artifactRef('FinalVideo'),
      cardinality: 'single',
      required: true,
      description: 'Assembled final video',
    },
  ],

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
