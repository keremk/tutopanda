import type { BlueprintSection } from '../types.js';
import {
  artifactRef,
  edge,
  inputRef,
  node,
  producerRef,
  segmentDim,
} from './helpers.js';

export const scriptSection: BlueprintSection = {
  id: 'script',
  label: 'Script & Summary',

  inputs: [
    {
      name: 'inquiryPrompt',
      ref: inputRef('InquiryPrompt'),
      cardinality: 'single',
      required: true,
      description: 'User inquiry prompt',
    },
    {
      name: 'duration',
      ref: inputRef('Duration'),
      cardinality: 'single',
      required: false,
      description: 'Duration for the video',
    },
    {
      name: 'audience',
      ref: inputRef('Audience'),
      cardinality: 'single',
      required: false,
      description: 'Target audience',
    },
    {
      name: 'language',
      ref: inputRef('Language'),
      cardinality: 'single',
      required: false,
      description: 'Language for the script',
    },
  ],

  outputs: [
    {
      name: 'narrationScript',
      ref: artifactRef('NarrationScript'),
      cardinality: 'perSegment',
      required: true,
      description: 'Generated narration script per segment',
    },
    {
      name: 'movieSummary',
      ref: artifactRef('MovieSummary'),
      cardinality: 'single',
      required: false,
      description: 'Movie summary',
    },
    {
      name: 'movieTitle',
      ref: artifactRef('MovieTitle'),
      cardinality: 'single',
      required: false,
      description: 'Movie title',
    },
  ],

  nodes: [
    node(inputRef('InquiryPrompt'), 'single'),
    node(inputRef('Duration'), 'single'),
    node(inputRef('Audience'), 'single'),
    node(inputRef('Language'), 'single'),
    node(producerRef('ScriptProducer'), 'single'),
    node(artifactRef('NarrationScript'), 'perSegment'),
    node(artifactRef('MovieSummary'), 'single'),
    node(artifactRef('MovieTitle'), 'single'),
  ],
  edges: [
    edge(inputRef('InquiryPrompt'), producerRef('ScriptProducer')),
    edge(inputRef('Duration'), producerRef('ScriptProducer')),
    edge(inputRef('Audience'), producerRef('ScriptProducer')),
    edge(inputRef('Language'), producerRef('ScriptProducer')),
    edge(producerRef('ScriptProducer'), artifactRef('NarrationScript'), {
      dimensions: segmentDim,
    }),
    edge(producerRef('ScriptProducer'), artifactRef('MovieSummary')),
    edge(producerRef('ScriptProducer'), artifactRef('MovieTitle')),
  ],
};
