import { describe, expect, it } from 'vitest';
import { createTimelineStubHandler } from './stub.js';
import type { ProviderJobContext } from '../../types.js';

function makeRequest(groups: string[][]): ProviderJobContext {
  return {
    provider: 'tutopanda',
    model: 'OrderedTimeline',
    jobId: 'job-1',
    revision: 'rev-0001',
    layerIndex: 0,
    attempt: 1,
    inputs: [],
    produces: ['Artifact:TimelineComposer.Timeline'],
    context: {
      extras: {
        resolvedInputs: {
          'Input:TimelineComposer.ImageSegments': { groupBy: 'segment', groups },
          'Input:TimelineComposer.AudioSegments': { groupBy: 'segment', groups },
        },
      },
    },
  };
}

describe('TimelineProducer stub', () => {
  it('returns timeline artefact when fan-in inputs are provided', async () => {
    const handler = createTimelineStubHandler()({
      descriptor: { provider: 'tutopanda', model: 'OrderedTimeline', environment: 'local' },
      mode: 'live',
      secretResolver: { getSecret: async () => null },
    });
    const request = makeRequest([
      ['Artifact:Image[0]'],
      ['Artifact:Image[1]'],
    ]);
    const result = await handler.invoke(request);
    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(1);
    expect(result.artefacts[0]?.artefactId).toBe('Artifact:TimelineComposer.Timeline');
    expect(result.artefacts[0]?.inline).toContain('Timeline Stub Summary');
    expect(result.artefacts[0]?.inline).toContain('Images:');
    expect(result.artefacts[0]?.inline).toContain('Audio:');
  });
});
