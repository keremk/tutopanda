import type { BlueprintSection } from '../types.js';
import {
  artifactRef,
  edge,
  inputRef,
  node,
  producerRef,
  segmentDim,
  textVideoOnly,
} from './helpers.js';

export const videoFromTextSection: BlueprintSection = {
  id: 'video-text',
  label: 'Video From Text',
  nodes: [
    node(inputRef('ImageStyle'), 'single'),
    node(inputRef('MovieDirectionPromptInput'), 'perSegment'),
    node(inputRef('Size'), 'single'),
    node(inputRef('AspectRatio'), 'single'),
    node(producerRef('TextToVideoPromptProducer'), 'perSegment', { when: textVideoOnly }),
    node(artifactRef('TextToVideoPrompt'), 'perSegment', { when: textVideoOnly }),
    node(producerRef('TextToVideoProducer'), 'perSegment', { when: textVideoOnly }),
    node(artifactRef('SegmentVideo'), 'perSegment', { when: textVideoOnly }),
  ],
  edges: [
    edge(inputRef('ImageStyle'), producerRef('TextToVideoPromptProducer'), {
      when: textVideoOnly,
    }),
    edge(producerRef('TextToVideoPromptProducer'), artifactRef('TextToVideoPrompt'), {
      dimensions: segmentDim,
      when: textVideoOnly,
    }),
    edge(artifactRef('TextToVideoPrompt'), producerRef('TextToVideoProducer'), {
      dimensions: segmentDim,
      when: textVideoOnly,
    }),
    edge(inputRef('MovieDirectionPromptInput'), producerRef('TextToVideoProducer'), {
      dimensions: segmentDim,
      when: textVideoOnly,
    }),
    edge(inputRef('Size'), producerRef('TextToVideoProducer'), {
      when: textVideoOnly,
    }),
    edge(inputRef('AspectRatio'), producerRef('TextToVideoProducer'), {
      when: textVideoOnly,
    }),
    edge(producerRef('TextToVideoProducer'), artifactRef('SegmentVideo'), {
      dimensions: segmentDim,
      when: textVideoOnly,
    }),
  ],
};
