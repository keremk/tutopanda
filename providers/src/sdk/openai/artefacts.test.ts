import { describe, it, expect } from 'vitest';
import { buildArtefactsFromResponse } from './artefacts.js';

describe('buildArtefactsFromResponse', () => {
  it('trims namespace ordinals so nested fanout arrays resolve correctly', () => {
    const response = {
      ImagePrompt: ['first frame', 'second frame'],
    };
    const produces = [
      'Artifact:ImagePromptGenerator.ImagePrompt[0][0]',
      'Artifact:ImagePromptGenerator.ImagePrompt[0][1]',
    ];

    const artefacts = buildArtefactsFromResponse(response, produces, {
      producerId: 'Producer:ImagePromptGenerator.ImagePromptProducer[0]',
    });

    expect(artefacts).toHaveLength(2);
    expect(artefacts[0]?.inline).toBe('first frame');
    expect(artefacts[1]?.inline).toBe('second frame');
    expect(artefacts.every((artefact) => artefact.status === 'succeeded')).toBe(true);
  });

  it('skips indexing when artefacts only carry namespace ordinals', () => {
    const response = {
      ImageSummary: 'concise summary',
    };
    const produces = ['Artifact:ImagePromptGenerator.ImageSummary[0]'];

    const artefacts = buildArtefactsFromResponse(response, produces, {
      producerId: 'Producer:ImagePromptGenerator.ImagePromptProducer[0]',
    });

    expect(artefacts).toHaveLength(1);
    expect(artefacts[0]?.inline).toBe('concise summary');
    expect(artefacts[0]?.status).toBe('succeeded');
  });
});
