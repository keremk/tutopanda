import type { BlueprintSection } from '../types.js';
import {
  artifactRef,
  edge,
  producerRef,
  segmentDim,
  segmentImageDims,
  imageVideoOnly,
  textVideoOnly,
  useImagesOnly,
} from './helpers.js';

export const connectionsSection: BlueprintSection = {
  id: 'connections',
  label: 'Cross-Lane Connections',
  nodes: [],
  edges: [
    edge(artifactRef('NarrationScript'), producerRef('TextToMusicPromptProducer'), {
      dimensions: segmentDim,
      note: 'Script segments inform tonal analysis',
    }),
    edge(artifactRef('MovieSummary'), producerRef('TextToMusicPromptProducer')),
    edge(artifactRef('MovieTitle'), producerRef('TextToMusicPromptProducer')),

    edge(artifactRef('NarrationScript'), producerRef('AudioProducer'), {
      dimensions: segmentDim,
    }),

    edge(artifactRef('NarrationScript'), producerRef('TextToImagePromptProducer'), {
      dimensions: segmentDim,
      when: useImagesOnly,
    }),

    edge(artifactRef('NarrationScript'), producerRef('TextToVideoPromptProducer'), {
      dimensions: segmentDim,
      when: textVideoOnly,
    }),
    edge(artifactRef('NarrationScript'), producerRef('ImageToVideoPromptProducer'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),

    edge(artifactRef('MusicTrack'), producerRef('TimelineAssembler')),
    edge(artifactRef('SegmentAudio'), producerRef('TimelineAssembler'), {
      dimensions: segmentDim,
    }),
    edge(artifactRef('SegmentImage'), producerRef('TimelineAssembler'), {
      dimensions: segmentImageDims,
      when: useImagesOnly,
    }),
    edge(artifactRef('SegmentVideo'), producerRef('TimelineAssembler'), {
      dimensions: segmentDim,
      when: textVideoOnly,
    }),
    edge(artifactRef('SegmentVideo'), producerRef('TimelineAssembler'), {
      dimensions: segmentDim,
      when: imageVideoOnly,
    }),
  ],
};
