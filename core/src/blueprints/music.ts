import type { BlueprintSection } from '../types.js';
import {
  artifactRef,
  edge,
  inputRef,
  node,
  producerRef,
} from './helpers.js';

export const musicSection: BlueprintSection = {
  id: 'music',
  label: 'Music Generation',
  nodes: [
    node(producerRef('TextToMusicPromptProducer'), 'single'),
    node(artifactRef('MusicPrompt'), 'single'),
    node(inputRef('MusicPromptInput'), 'single'),
    node(producerRef('TextToMusicProducer'), 'single'),
    node(artifactRef('MusicTrack'), 'single'),
  ],
  edges: [
    edge(producerRef('TextToMusicPromptProducer'), artifactRef('MusicPrompt')),
    edge(artifactRef('MusicPrompt'), producerRef('TextToMusicProducer')),
    edge(inputRef('MusicPromptInput'), producerRef('TextToMusicProducer')),
    edge(producerRef('TextToMusicProducer'), artifactRef('MusicTrack')),
  ],
};
