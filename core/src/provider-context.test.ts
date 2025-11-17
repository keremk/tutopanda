import { describe, expect, it } from 'vitest';
import { prepareJobContext } from './provider-context.js';
import type { JobDescriptor } from './types.js';

describe('prepareJobContext', () => {
  it('overrides namespaced canonical defaults with explicit values', () => {
    const job = createJobDescriptor();
    const baseInputs = {
      NumOfImagesPerNarrative: 2,
      'Input:ImagePromptGenerator.NumOfImagesPerNarrative': 1,
    };

    const { resolvedInputs } = prepareJobContext(job, baseInputs);

    expect(resolvedInputs['Input:NumOfImagesPerNarrative']).toBe(2);
    expect(resolvedInputs['Input:ImagePromptGenerator.NumOfImagesPerNarrative']).toBe(2);
    expect(resolvedInputs.NumOfImagesPerNarrative).toBe(2);
  });

  it('keeps canonical defaults when no explicit value is provided', () => {
    const job = createJobDescriptor();
    const baseInputs = {
      'Input:ImagePromptGenerator.NumOfImagesPerNarrative': 1,
    };

    const { resolvedInputs } = prepareJobContext(job, baseInputs);

    expect(resolvedInputs['Input:ImagePromptGenerator.NumOfImagesPerNarrative']).toBe(1);
  });

  it('adds canonical entries when none exist', () => {
    const job = createJobDescriptor();
    const baseInputs = {
      NumOfSegments: 3,
    };

    const { resolvedInputs } = prepareJobContext(job, baseInputs);

    expect(resolvedInputs['Input:NumOfSegments']).toBe(3);
  });
});

function createJobDescriptor(): JobDescriptor {
  return {
    jobId: 'Producer:ImagePromptGenerator.ImagePromptProducer[segment=0]',
    producer: 'ImagePromptProducer',
    inputs: [],
    produces: [],
    provider: 'openai',
    providerModel: 'gpt-5-mini',
    rateKey: 'openai:gpt-5-mini',
    context: {
      namespacePath: ['ImagePromptGenerator'],
      indices: {},
      qualifiedName: 'ImagePromptGenerator.ImagePromptProducer',
      inputs: [],
      produces: [],
      inputBindings: {
        NumOfImagesPerNarrative: 'Input:ImagePromptGenerator.NumOfImagesPerNarrative',
      },
    },
  };
}
