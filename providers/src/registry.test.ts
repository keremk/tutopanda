import { describe, expect, it } from 'vitest';
import { createProviderRegistry } from './index.js';

describe('createProviderRegistry', () => {
  it('returns mock handlers by default', async () => {
    const registry = createProviderRegistry();
    const handler = registry.resolve({
      kind: 'ScriptProducer',
      provider: 'openai',
      model: 'openai/GPT-5',
    });

    expect(handler.mode).toBe('mock');

    const result = await handler.invoke({
      jobId: 'job-123',
      producer: 'ScriptProducer',
      provider: 'openai',
      model: 'openai/GPT-5',
      revision: 'rev-0001',
      layerIndex: 0,
      attempt: 1,
      inputs: [],
      produces: ['Artifact:NarrationScript'],
      context: {},
    });

    expect(result.artefacts).toHaveLength(1);
    expect(result.artefacts[0].inline).toContain('Mock');
  });

  it('produces blob artefacts for media outputs', async () => {
    const registry = createProviderRegistry();
    const handler = registry.resolve({
      kind: 'ImageToVideoProducer',
      provider: 'replicate',
      model: 'bytedance/seedance-1-lite',
    });

    const result = await handler.invoke({
      jobId: 'job-video',
      producer: 'ImageToVideoProducer',
      provider: 'replicate',
      model: 'bytedance/seedance-1-lite',
      revision: 'rev-0002',
      layerIndex: 1,
      attempt: 1,
      inputs: ['Artifact:StartImage'],
      produces: ['Artifact:SegmentVideo[segment=0]'],
      context: {},
    });

    expect(result.artefacts).toHaveLength(1);
    expect(result.artefacts[0].blob?.mimeType).toBe('video/mp4');
    expect(result.artefacts[0].blob?.data).toBeDefined();
  });
});
