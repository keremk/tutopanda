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
  nodes: [
    node(inputRef('SegmentNarrationInput'), 'perSegment'),
    node(inputRef('VoiceId'), 'perSegment'),
    node(inputRef('Emotion'), 'perSegment'),
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
    edge(inputRef('Emotion'), producerRef('AudioProducer'), {
      dimensions: segmentDim,
    }),
    edge(producerRef('AudioProducer'), artifactRef('SegmentAudio'), {
      dimensions: segmentDim,
    }),
  ],
};
