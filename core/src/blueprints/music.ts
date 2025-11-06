import type { BlueprintSection } from '../types.js';
import { artifactRef, edge, inputRef, node, producerRef } from './helpers.js';

export const musicSection: BlueprintSection = {
  id: 'music',
  label: 'Music Generation',

  inputs: [
    {
      name: 'musicPromptInput',
      ref: inputRef('MusicPromptInput'),
      cardinality: 'single',
      required: false,
      description: 'Custom music prompt input',
    },
    {
      name: 'duration',
      ref: inputRef('Duration'),
      cardinality: 'single',
      required: false,
      description: 'Duration of music track',
    },
  ],

  outputs: [
    {
      name: 'musicTrack',
      ref: artifactRef('MusicTrack'),
      cardinality: 'single',
      required: true,
      description: 'Generated background music track',
    },
    {
      name: 'musicPrompt',
      ref: artifactRef('MusicPrompt'),
      cardinality: 'single',
      required: false,
      description: 'Generated music prompt',
    },
  ],

  nodes: [
    node(producerRef('TextToMusicPromptProducer'), 'single'),
    node(artifactRef('MusicPrompt'), 'single'),
    node(inputRef('MusicPromptInput'), 'single'),
    node(producerRef('TextToMusicProducer'), 'single'),
    node(artifactRef('MusicTrack'), 'single'),
  ],
  edges: [
    edge(inputRef('Duration'), producerRef('TextToMusicProducer')),
    edge(producerRef('TextToMusicPromptProducer'), artifactRef('MusicPrompt')),
    edge(artifactRef('MusicPrompt'), producerRef('TextToMusicProducer')),
    edge(inputRef('MusicPromptInput'), producerRef('TextToMusicProducer')),
    edge(producerRef('TextToMusicProducer'), artifactRef('MusicTrack')),
  ],
};
