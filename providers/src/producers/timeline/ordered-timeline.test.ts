import { describe, expect, it, vi } from 'vitest';
import { createTimelineProducerHandler } from './ordered-timeline.js';
import type { ProviderJobContext } from '../../types.js';

vi.mock('mediabunny', () => {
  class MockBufferSource {
    buffer: Uint8Array;

    constructor(data: ArrayBuffer | ArrayBufferView) {
      if (data instanceof ArrayBuffer) {
        this.buffer = new Uint8Array(data);
        return;
      }
      if (ArrayBuffer.isView(data)) {
        const view = data as ArrayBufferView;
        this.buffer = new Uint8Array(view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength));
        return;
      }
      throw new Error('Unsupported buffer payload.');
    }
  }

  class MockInput {
    private readonly source: MockBufferSource;

    constructor(options: { source: MockBufferSource }) {
      this.source = options.source;
    }

    async computeDuration() {
      const value = this.source.buffer[0];
      if (!Number.isFinite(value)) {
        throw new Error('Missing duration byte.');
      }
      return value;
    }

    dispose() {}
  }

  return {
    Input: MockInput,
    BufferSource: MockBufferSource,
    ALL_FORMATS: [],
  } satisfies Record<string, unknown>;
});

function createHandler() {
  return createTimelineProducerHandler()({
    descriptor: { provider: 'tutopanda', model: 'OrderedTimeline', environment: 'local' },
    mode: 'live',
    secretResolver: { getSecret: async () => null },
  });
}

function makeRequest(options: { omitAudio?: boolean; audioDurations?: number[] } = {}): ProviderJobContext {
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
  const audioDurations = options.audioDurations ?? [12, 8];

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
  } else {
    audioGroups.forEach((group, index) => {
      const assetId = group[0];
      if (!assetId) {
        return;
      }
      const payload = createAssetPayload(audioDurations[index] ?? audioDurations[0] ?? 1);
      resolvedInputs[assetId] = payload;
    });
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

function createAssetPayload(duration: number): Uint8Array {
  const rounded = Math.max(1, Math.round(duration));
  return new Uint8Array([rounded]);
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
    expect(audioTrack?.clips[0]?.duration).toBeCloseTo(12);
    expect(audioTrack?.clips[0]?.properties.assetId).toBe('Artifact:Audio[0]');
    expect(audioTrack?.clips[1]?.startTime).toBeCloseTo(12);
    expect(audioTrack?.clips[1]?.duration).toBeCloseTo(8);

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

  it('loops music clips to cover the entire timeline', async () => {
    const handler = createHandler();
    const request = makeRequest();
    const resolvedInputs = request.context.extras?.resolvedInputs as Record<string, unknown>;
    const config = request.context.providerConfig as { config: { clips: Array<Record<string, unknown>>; numTracks: number } };
    config.config.clips.push({ kind: 'Music', inputs: 'MusicSegments', play: 'loop', duration: 'full', volume: 0.2 });
    config.config.numTracks = 3;
    request.inputs.push('Input:TimelineComposer.MusicSegments');

    const musicFanIn = { groupBy: 'music', groups: [['Artifact:Music[0]']] };
    resolvedInputs['Input:TimelineComposer.MusicSegments'] = musicFanIn;
    resolvedInputs['TimelineComposer.MusicSegments'] = musicFanIn;
    resolvedInputs.MusicSegments = musicFanIn.groups;
    resolvedInputs['Artifact:Music[0]'] = createAssetPayload(5);

    const result = await handler.invoke(request);
    const timeline = JSON.parse(result.artefacts[0]?.inline ?? '{}') as { tracks: Array<{ kind: string; clips: Array<{ startTime: number; duration: number }> }> };
    const musicTrack = timeline.tracks.find((track) => track.kind === 'Music');
    expect(musicTrack).toBeDefined();
    expect(musicTrack?.clips).toHaveLength(4);
    expect(musicTrack?.clips[0]?.startTime).toBe(0);
    expect(musicTrack?.clips[3]?.startTime).toBeCloseTo(15);
    expect(musicTrack?.clips[3]?.duration).toBeCloseTo(5);
  });

  it('stops music when looping is disabled', async () => {
    const handler = createHandler();
    const request = makeRequest();
    const resolvedInputs = request.context.extras?.resolvedInputs as Record<string, unknown>;
    const config = request.context.providerConfig as { config: { clips: Array<Record<string, unknown>>; numTracks: number } };
    config.config.clips.push({ kind: 'Music', inputs: 'MusicSegments', play: 'no-loop', duration: 'full' });
    config.config.numTracks = 3;
    request.inputs.push('Input:TimelineComposer.MusicSegments');

    const musicFanIn = { groupBy: 'music', groups: [['Artifact:Music[0]']] };
    resolvedInputs['Input:TimelineComposer.MusicSegments'] = musicFanIn;
    resolvedInputs['TimelineComposer.MusicSegments'] = musicFanIn;
    resolvedInputs.MusicSegments = musicFanIn.groups;
    resolvedInputs['Artifact:Music[0]'] = createAssetPayload(6);

    const result = await handler.invoke(request);
    const timeline = JSON.parse(result.artefacts[0]?.inline ?? '{}') as { tracks: Array<{ kind: string; clips: Array<{ startTime: number; duration: number }> }> };
    const musicTrack = timeline.tracks.find((track) => track.kind === 'Music');
    expect(musicTrack).toBeDefined();
    expect(musicTrack?.clips).toHaveLength(1);
    expect(musicTrack?.clips[0]?.duration).toBeCloseTo(6);
    expect(musicTrack?.clips[0]?.startTime).toBe(0);
  });

  it('emits video clips with original durations and auto fit strategies', async () => {
    const handler = createHandler();
    const request = makeRequest();
    const resolvedInputs = request.context.extras?.resolvedInputs as Record<string, unknown>;
    const config = request.context.providerConfig as { config: { clips: Array<Record<string, unknown>>; numTracks: number } };
    config.config.clips.push({ kind: 'Video', inputs: 'VideoSegments', fitStrategy: 'auto' });
    config.config.numTracks = 3;
    request.inputs.push('Input:TimelineComposer.VideoSegments');

    const videoFanIn = {
      groupBy: 'segment',
      groups: [
        ['Artifact:Video[0]'],
        ['Artifact:Video[1]'],
      ],
    };
    resolvedInputs['Input:TimelineComposer.VideoSegments'] = videoFanIn;
    resolvedInputs['TimelineComposer.VideoSegments'] = videoFanIn;
    resolvedInputs.VideoSegments = videoFanIn.groups;
    resolvedInputs['Artifact:Video[0]'] = createAssetPayload(9);
    resolvedInputs['Artifact:Video[1]'] = createAssetPayload(8);

    const result = await handler.invoke(request);
    const timeline = JSON.parse(result.artefacts[0]?.inline ?? '{}') as {
      tracks: Array<{ kind: string; clips: Array<{ duration: number; properties: Record<string, unknown> }> }>;
    };
    const videoTrack = timeline.tracks.find((track) => track.kind === 'Video');
    expect(videoTrack).toBeDefined();
    expect(videoTrack?.clips).toHaveLength(2);
    expect(videoTrack?.clips[0]?.properties.originalDuration).toBeCloseTo(9);
    expect(videoTrack?.clips[0]?.properties.fitStrategy).toBe('freeze-fade');
    expect(videoTrack?.clips[1]?.properties.originalDuration).toBeCloseTo(8);
    expect(videoTrack?.clips[1]?.properties.fitStrategy).toBe('stretch');
  });
});
