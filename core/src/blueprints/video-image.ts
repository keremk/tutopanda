import type { BlueprintSection } from '../types.js';
import {
  artifactRef,
  edge,
  inputRef,
  node,
  producerRef,
  segmentDim,
  imageVideoOnly,
} from './helpers.js';

export const videoFromImageSection: BlueprintSection = {
  id: 'video-image',
  label: 'Video From Image',

  inputs: [
    {
      name: 'imageStyle',
      ref: inputRef('ImageStyle'),
      cardinality: 'single',
      required: false,
      description: 'Style for video generation',
    },
    {
      name: 'startingImagePromptInput',
      ref: inputRef('StartingImagePromptInput'),
      cardinality: 'perSegment',
      required: false,
      description: 'Starting image prompts',
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
      when: [imageVideoOnly],
    },
    {
      name: 'imageToVideoPrompt',
      ref: artifactRef('ImageToVideoPrompt'),
      cardinality: 'perSegment',
      required: false,
      description: 'Generated image-to-video prompts',
      when: [imageVideoOnly],
    },
    {
      name: 'startImage',
      ref: artifactRef('StartImage'),
      cardinality: 'perSegment',
      required: false,
      description: 'Generated starting images',
      when: [imageVideoOnly],
    },
  ],

  nodes: [
    node(inputRef('ImageStyle'), 'single'),
    node(inputRef('StartingImagePromptInput'), 'perSegment'),
    node(inputRef('MovieDirectionPromptInput'), 'perSegment'),
    node(inputRef('Size'), 'single'),
    node(inputRef('AspectRatio'), 'single'),
    node(producerRef('ImageToVideoPromptProducer'), 'perSegment', { when: imageVideoOnly }),
    node(artifactRef('ImageToVideoPrompt'), 'perSegment', { when: imageVideoOnly }),
    node(artifactRef('StartImagePrompt'), 'perSegment', { when: imageVideoOnly }),
    node(producerRef('StartImageProducer'), 'perSegment', { when: imageVideoOnly }),
    node(artifactRef('StartImage'), 'perSegment', { when: imageVideoOnly }),
    node(producerRef('ImageToVideoProducer'), 'perSegment', { when: imageVideoOnly }),
    node(artifactRef('SegmentVideo'), 'perSegment', { when: imageVideoOnly }),
  ],
  edges: [
    edge(inputRef('ImageStyle'), producerRef('ImageToVideoPromptProducer'), {
      when: imageVideoOnly,
    }),
    edge(producerRef('ImageToVideoPromptProducer'), artifactRef('ImageToVideoPrompt'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
    edge(producerRef('ImageToVideoPromptProducer'), artifactRef('StartImagePrompt'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
    edge(artifactRef('StartImagePrompt'), producerRef('StartImageProducer'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
    edge(inputRef('StartingImagePromptInput'), producerRef('StartImageProducer'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
    edge(producerRef('StartImageProducer'), artifactRef('StartImage'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
    edge(artifactRef('ImageToVideoPrompt'), producerRef('ImageToVideoProducer'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
    edge(artifactRef('StartImage'), producerRef('ImageToVideoProducer'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
    edge(inputRef('MovieDirectionPromptInput'), producerRef('ImageToVideoProducer'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
    edge(inputRef('Size'), producerRef('ImageToVideoProducer'), {
      when: imageVideoOnly,
    }),
    edge(inputRef('AspectRatio'), producerRef('ImageToVideoProducer'), {
      when: imageVideoOnly,
    }),
    edge(producerRef('ImageToVideoProducer'), artifactRef('SegmentVideo'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
  ],
};
