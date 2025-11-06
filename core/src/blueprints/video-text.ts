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

  inputs: [
    {
      name: 'imageStyle',
      ref: inputRef('ImageStyle'),
      cardinality: 'single',
      required: false,
      description: 'Style for video generation',
    },
    {
      name: 'movieDirectionPromptInput',
      ref: inputRef('MovieDirectionPromptInput'),
      cardinality: 'perSegment',
      required: false,
      description: 'Movie direction prompts',
    },
    {
      name: 'size',
      ref: inputRef('Size'),
      cardinality: 'single',
      required: false,
      description: 'Video size',
    },
    {
      name: 'aspectRatio',
      ref: inputRef('AspectRatio'),
      cardinality: 'single',
      required: false,
      description: 'Video aspect ratio',
    },
  ],

  outputs: [
    {
      name: 'segmentVideo',
      ref: artifactRef('SegmentVideo'),
      cardinality: 'perSegment',
      required: true,
      description: 'Generated video for each segment',
      when: [textVideoOnly],
    },
    {
      name: 'textToVideoPrompt',
      ref: artifactRef('TextToVideoPrompt'),
      cardinality: 'perSegment',
      required: false,
      description: 'Generated text-to-video prompts',
      when: [textVideoOnly],
    },
  ],

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
