import { describe, expect, it } from 'vitest';
import { createTimelineProducerHandler } from './ordered-timeline.js';
import type { ProviderJobContext } from '../../types.js';

function createHandler() {
  return createTimelineProducerHandler()({
    descriptor: { provider: 'tutopanda', model: 'OrderedTimeline', environment: 'local' },
    mode: 'live',
    secretResolver: { getSecret: async () => null },
  });
}

function makeRequest(options: { omitAudio?: boolean } = {}): ProviderJobContext {
  const imageGroups = [
    ['Artifact:Image[0][0]', 'Artifact:Image[0][1]'],
    ['Artifact:Image[1][0]'],
  ];
  const audioGroups = options.omitAudio
    ? []
    : [
        ['Artifact:Audio[0]'],
        ['Artifact:Audio[1]'],
      ];

  const resolvedInputs: Record<string, unknown> = {
    'Input:TimelineComposer.ImageSegments': { groupBy: 'segment', orderBy: 'image', groups: imageGroups },
    'TimelineComposer.ImageSegments': { groupBy: 'segment', orderBy: 'image', groups: imageGroups },
    ImageSegments: imageGroups,
    'Input:TimelineComposer.AudioSegments': { groupBy: 'segment', groups: audioGroups },
    'TimelineComposer.AudioSegments': { groupBy: 'segment', groups: audioGroups },
    AudioSegments: audioGroups,
    'Input:TimelineComposer.Duration': 20,
    'TimelineComposer.Duration': 20,
    Duration: 20,
    MovieTitle: 'Comet Tales',
  };

  if (options.omitAudio) {
    delete resolvedInputs['Input:TimelineComposer.AudioSegments'];
    delete resolvedInputs['TimelineComposer.AudioSegments'];
    delete resolvedInputs.AudioSegments;
  }

  return {
    provider: 'tutopanda',
    model: 'OrderedTimeline',
    jobId: 'job-1',
    revision: 'rev-0001',
    layerIndex: 0,
    attempt: 1,
    inputs: [
      'Input:TimelineComposer.ImageSegments',
      'Input:TimelineComposer.AudioSegments',
      'Input:TimelineComposer.Duration',
    ],
    produces: ['Artifact:TimelineComposer.Timeline'],
    context: {
      providerConfig: {
        config: {
          rootFolder: '/tmp/tutopanda',
          source: 'local',
          numTracks: 2,
          masterTrack: { kind: 'Audio' },
          clips: [
            { kind: 'Image', inputs: 'ImageSegments[segment]', effect: 'KenBurns' },
            { kind: 'Audio', inputs: 'AudioSegments' },
          ],
        },
      },
      extras: {
        resolvedInputs,
      },
    },
  };
}

describe('TimelineProducer', () => {
  it('builds a timeline document with aligned tracks', async () => {
    const handler = createHandler();
    const request = makeRequest();
    const result = await handler.invoke(request);

    expect(result.status).toBe('succeeded');
    expect(result.artefacts).toHaveLength(1);
    const payload = result.artefacts[0]?.inline;
    expect(payload).toBeDefined();
    const timeline = JSON.parse(payload ?? '{}') as {
      duration: number;
      movieTitle?: string;
      tracks: Array<{ kind: string; clips: Array<{ startTime: number; duration: number; properties: Record<string, any> }> }>;
    };

    expect(timeline.duration).toBeCloseTo(20);
    expect(timeline.movieTitle).toBe('Comet Tales');
    expect(timeline.tracks).toHaveLength(2);

    const audioTrack = timeline.tracks.find((track) => track.kind === 'Audio');
    expect(audioTrack).toBeDefined();
    expect(audioTrack?.clips).toHaveLength(2);
    expect(audioTrack?.clips[0]?.startTime).toBe(0);
    expect(audioTrack?.clips[0]?.duration).toBeCloseTo(10);
    expect(audioTrack?.clips[0]?.properties.assetId).toBe('Artifact:Audio[0]');
    expect(audioTrack?.clips[1]?.startTime).toBeCloseTo(10);

    const imageTrack = timeline.tracks.find((track) => track.kind === 'Image');
    expect(imageTrack).toBeDefined();
    expect(imageTrack?.clips).toHaveLength(2);
    expect(imageTrack?.clips[0]?.properties.effects?.[0]?.assetId).toBe('Artifact:Image[0][0]');
  });

  it('throws when master audio segments are missing', async () => {
    const handler = createHandler();
    const request = makeRequest({ omitAudio: true });
    await expect(handler.invoke(request)).rejects.toThrow(/AudioSegments/);
  });
});
