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
