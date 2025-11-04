import { createMockProducerHandler } from './mock-producers.js';
import { createOpenAiLlmHandler } from './producers/llm/openai.js';
import { createReplicateTextToImageHandler } from './producers/image/replicate-text-to-image.js';
import { createReplicateAudioHandler } from './producers/audio/replicate-audio.js';
import type { ProviderImplementationRegistry } from './types.js';

const wildcard = '*' as const;

export const providerImplementations: ProviderImplementationRegistry = [
  {
    match: {
      provider: wildcard,
      model: wildcard,
      environment: wildcard,
    },
    mode: 'mock',
    factory: createMockProducerHandler(),
  },
  {
    match: {
      provider: 'openai',
      model: wildcard,
      environment: wildcard,
    },
    mode: 'live',
    factory: createOpenAiLlmHandler(),
  },
  // Replicate Image Models
  {
    match: {
      provider: 'replicate',
      model: 'bytedance/seedream-4',
      environment: wildcard,
    },
    mode: 'live',
    factory: createReplicateTextToImageHandler(),
  },
  {
    match: {
      provider: 'replicate',
      model: 'google/imagen-4',
      environment: wildcard,
    },
    mode: 'live',
    factory: createReplicateTextToImageHandler(),
  },
  {
    match: {
      provider: 'replicate',
      model: 'google/nano-banana',
      environment: wildcard,
    },
    mode: 'live',
    factory: createReplicateTextToImageHandler(),
  },
  {
    match: {
      provider: 'replicate',
      model: 'tencent/hunyuan-image-3',
      environment: wildcard,
    },
    mode: 'live',
    factory: createReplicateTextToImageHandler(),
  },
  // Replicate Audio Models
  {
    match: {
      provider: 'replicate',
      model: 'minimax/speech-02-hd',
      environment: wildcard,
    },
    mode: 'live',
    factory: createReplicateAudioHandler(),
  },
  {
    match: {
      provider: 'replicate',
      model: 'minimax/speech-2.6-hd',
      environment: wildcard,
    },
    mode: 'live',
    factory: createReplicateAudioHandler(),
  },
  {
    match: {
      provider: 'replicate',
      model: 'elevenlabs/v3',
      environment: wildcard,
    },
    mode: 'live',
    factory: createReplicateAudioHandler(),
  },
];
