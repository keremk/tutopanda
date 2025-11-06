import type { BlueprintSection } from '../types.js';
import {
  artifactRef,
  edge,
  inputRef,
  node,
  producerRef,
  segmentDim,
} from './helpers.js';

export const audioSection: BlueprintSection = {
  id: 'audio',
  label: 'Narration Audio',

  inputs: [
    {
      name: 'narrationScript',
      ref: artifactRef('NarrationScript'),
      cardinality: 'perSegment',
      required: true,
      description: 'Script text for each segment (from script section)',
    },
    {
      name: 'voiceId',
      ref: inputRef('VoiceId'),
      cardinality: 'perSegment',
      required: true,
      description: 'Voice ID for text-to-speech (user input)',
    },
  ],

  outputs: [
    {
      name: 'segmentAudio',
      ref: artifactRef('SegmentAudio'),
      cardinality: 'perSegment',
      required: true,
      description: 'Generated audio for each segment',
    },
  ],

  nodes: [
    node(inputRef('SegmentNarrationInput'), 'perSegment'),
    node(inputRef('VoiceId'), 'perSegment'),
    node(producerRef('AudioProducer'), 'perSegment'),
    node(artifactRef('SegmentAudio'), 'perSegment'),
  ],
  edges: [
    edge(inputRef('SegmentNarrationInput'), producerRef('AudioProducer'), {
      dimensions: segmentDim,
    }),
    edge(inputRef('VoiceId'), producerRef('AudioProducer'), {
      dimensions: segmentDim,
    }),
    edge(producerRef('AudioProducer'), artifactRef('SegmentAudio'), {
      dimensions: segmentDim,
    }),
  ],
};
