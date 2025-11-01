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
