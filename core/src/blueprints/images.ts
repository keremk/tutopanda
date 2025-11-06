import type { BlueprintSection } from '../types.js';
import {
  artifactRef,
  edge,
  inputRef,
  node,
  producerRef,
  segmentImageDims,
  useImagesOnly,
} from './helpers.js';

export const imagesSection: BlueprintSection = {
  id: 'images',
  label: 'Image Generation',

  inputs: [
    {
      name: 'imagesPerSegment',
      ref: inputRef('ImagesPerSegment'),
      cardinality: 'single',
      required: false,
      description: 'Number of images per segment',
    },
    {
      name: 'imageStyle',
      ref: inputRef('ImageStyle'),
      cardinality: 'single',
      required: false,
      description: 'Style for generated images',
    },
    {
      name: 'segmentImagePromptInput',
      ref: inputRef('SegmentImagePromptInput'),
      cardinality: 'perSegmentImage',
      required: false,
      description: 'Custom image prompts',
    },
    {
      name: 'size',
      ref: inputRef('Size'),
      cardinality: 'single',
      required: false,
      description: 'Image size',
    },
    {
      name: 'aspectRatio',
      ref: inputRef('AspectRatio'),
      cardinality: 'single',
      required: false,
      description: 'Image aspect ratio',
    },
  ],

  outputs: [
    {
      name: 'segmentImage',
      ref: artifactRef('SegmentImage'),
      cardinality: 'perSegmentImage',
      required: true,
      description: 'Generated images for each segment',
      when: [useImagesOnly],
    },
    {
      name: 'imagePrompt',
      ref: artifactRef('ImagePrompt'),
      cardinality: 'perSegmentImage',
      required: false,
      description: 'Generated prompts for image generation',
      when: [useImagesOnly],
    },
  ],

  nodes: [
    node(inputRef('ImagesPerSegment'), 'single'),
    node(inputRef('ImageStyle'), 'single'),
    node(inputRef('SegmentImagePromptInput'), 'perSegmentImage'),
    node(inputRef('Size'), 'single'),
    node(inputRef('AspectRatio'), 'single'),
    node(producerRef('TextToImagePromptProducer'), 'perSegment', { when: useImagesOnly }),
    node(artifactRef('ImagePrompt'), 'perSegmentImage', { when: useImagesOnly }),
    node(producerRef('TextToImageProducer'), 'perSegmentImage', { when: useImagesOnly }),
    node(artifactRef('SegmentImage'), 'perSegmentImage', { when: useImagesOnly }),
  ],
  edges: [
    edge(inputRef('ImagesPerSegment'), producerRef('TextToImagePromptProducer'), {
      when: useImagesOnly,
    }),
    edge(inputRef('ImageStyle'), producerRef('TextToImagePromptProducer'), {
      when: useImagesOnly,
    }),
    edge(producerRef('TextToImagePromptProducer'), artifactRef('ImagePrompt'), {
      dimensions: segmentImageDims,
      when: useImagesOnly,
    }),
    edge(artifactRef('ImagePrompt'), producerRef('TextToImageProducer'), {
      dimensions: segmentImageDims,
      when: useImagesOnly,
    }),
    edge(inputRef('SegmentImagePromptInput'), producerRef('TextToImageProducer'), {
      dimensions: segmentImageDims,
      when: useImagesOnly,
    }),
    edge(inputRef('Size'), producerRef('TextToImageProducer'), {
      when: useImagesOnly,
    }),
    edge(inputRef('AspectRatio'), producerRef('TextToImageProducer'), {
      when: useImagesOnly,
    }),
    edge(producerRef('TextToImageProducer'), artifactRef('SegmentImage'), {
      dimensions: segmentImageDims,
      when: useImagesOnly,
    }),
  ],
};
