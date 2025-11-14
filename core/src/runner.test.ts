import { describe, expect, it, vi } from 'vitest';
import { TextEncoder } from 'util';
import { createRunner } from './runner.js';
import { createEventLog } from './event-log.js';
import { createManifestService } from './manifest.js';
import { createStorageContext, initializeMovieStorage } from './storage.js';
import type {
  ArtefactEvent,
  ExecutionPlan,
  JobDescriptor,
  Manifest,
  ProduceRequest,
  ProduceResult,
} from './types.js';

const baseManifest: Manifest = {
  revision: 'rev-0000',
  baseRevision: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  inputs: {},
  artefacts: {},
};

const plan: ExecutionPlan = {
  revision: 'rev-0001',
  manifestBaseHash: 'hash-0000',
  layers: [
    [
      {
        jobId: 'job-1',
        producer: 'ScriptProducer',
        inputs: [],
        produces: ['Artifact:NarrationScript'],
        provider: 'openai',
        providerModel: 'openai/GPT-5',
        rateKey: 'llm:script',
      },
    ],
    [
      {
        jobId: 'job-2',
        producer: 'AudioProducer',
        inputs: ['Artifact:NarrationScript'],
        produces: ['Artifact:SegmentAudio[segment=0]'],
        provider: 'replicate',
        providerModel: 'elevenlabs/turbo-v2.5',
        rateKey: 'audio:elevenlabs-turbo',
      },
    ],
  ],
  createdAt: '2024-01-02T00:00:00.000Z',
};

describe('createRunner', () => {
  it('executes layers and persists artefacts', async () => {
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, 'movie-123');
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    const produce = vi.fn(async (request: ProduceRequest): Promise<ProduceResult> => {
      if (request.job.jobId === 'job-1') {
        return {
          jobId: request.job.jobId,
          status: 'succeeded',
          artefacts: [
            {
              artefactId: 'Artifact:NarrationScript',
              inline: 'Once upon a time',
            },
          ],
        };
      }
      return {
        jobId: request.job.jobId,
        status: 'succeeded',
        artefacts: [
          {
            artefactId: 'Artifact:SegmentAudio[segment=0]',
            blob: {
              data: new TextEncoder().encode('AUDIO_DATA'),
              mimeType: 'audio/wav',
            },
          },
        ],
      };
    });

    const runner = createRunner();
    const result = await runner.execute(plan, {
      movieId: 'movie-123',
      manifest: baseManifest,
      storage,
      eventLog,
      manifestService,
      produce,
    });

    expect(produce).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('succeeded');
    expect(result.jobs).toHaveLength(2);

    const firstJob = result.jobs.find((job) => job.jobId === 'job-1');
    expect(firstJob?.artefacts[0].output.inline).toBe('Once upon a time');
    expect(firstJob?.artefacts[0].output.blob).toBeDefined();
    expect(firstJob?.artefacts[0].output.blob?.mimeType).toBe('text/plain');

    const manifest = await result.buildManifest();
    expect(manifest.revision).toBe('rev-0001');
    expect(Object.keys(manifest.artefacts)).toContain('Artifact:NarrationScript');
    expect(Object.keys(manifest.artefacts)).toContain('Artifact:SegmentAudio[segment=0]');
  });

  it('uses stub produce when none supplied', async () => {
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, 'movie-456');
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    const runner = createRunner();
    const result = await runner.execute(plan, {
      movieId: 'movie-456',
      manifest: baseManifest,
      storage,
      eventLog,
      manifestService,
    });

    expect(result.status).toBe('succeeded');
    expect(result.jobs.every((job) => job.status === 'skipped')).toBe(true);
  });

  it('marks run as failed when job throws', async () => {
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, 'movie-error');
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    const produce = vi.fn(async (request: ProduceRequest): Promise<ProduceResult> => {
      if (request.job.jobId === 'job-2') {
        throw new Error('boom');
      }
      return {
        jobId: request.job.jobId,
        status: 'succeeded',
        artefacts: [
          {
            artefactId: 'Artifact:NarrationScript',
            inline: 'Hello world',
          },
        ],
      };
    });

    const runner = createRunner();
    const result = await runner.execute(plan, {
      movieId: 'movie-error',
      manifest: baseManifest,
      storage,
      eventLog,
      manifestService,
      produce,
    });

    expect(result.status).toBe('failed');
    const failedJob = result.jobs.find((job) => job.jobId === 'job-2');
    expect(failedJob?.status).toBe('failed');
    expect(failedJob?.error?.message).toContain('boom');
  });

  it('injects alias inputs derived from upstream artefacts', async () => {
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, 'movie-alias');
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    const artefactEvent: ArtefactEvent = {
      artefactId: 'Artifact:ScriptGeneration.NarrationScript[segment=0]',
      revision: 'rev-0001',
      inputsHash: 'hash',
      output: { inline: 'aliased text' },
      status: 'succeeded',
      producedBy: 'Producer:ScriptGeneration.ScriptProducer[segment=0]',
      createdAt: new Date().toISOString(),
    };

    await eventLog.appendArtefact('movie-alias', artefactEvent);

    let observedResolvedInputs: Record<string, unknown> | undefined;

    const runner = createRunner({
      produce: async (request) => {
        observedResolvedInputs = request.job.context?.extras?.resolvedInputs as Record<string, unknown> | undefined;
        return {
          jobId: request.job.jobId,
          status: 'succeeded',
          artefacts: [],
        };
      },
    });

    const job: JobDescriptor = {
      jobId: 'job-alias',
      producer: 'ImagePromptGeneration.ImagePromptProducer[segment=0]',
      inputs: [
        'Artifact:ScriptGeneration.NarrationScript[segment=0]',
        'Input:ImagePromptGeneration.NarrativeText',
      ],
      produces: [],
      provider: 'openai',
      providerModel: 'gpt-5-mini',
      rateKey: 'llm:image_prompt',
      context: {
        namespacePath: ['ImagePromptGeneration'],
        indices: { segment: 0 },
        qualifiedName: 'ImagePromptGeneration.ImagePromptProducer',
        inputs: [
          'Artifact:ScriptGeneration.NarrationScript[segment=0]',
          'Input:ImagePromptGeneration.NarrativeText',
        ],
        produces: [],
        inputBindings: {
          NarrativeText: 'Artifact:ScriptGeneration.NarrationScript[segment=0]',
        },
      },
    };

    const manifest: Manifest = {
      revision: 'rev-0001',
      baseRevision: null,
      createdAt: new Date().toISOString(),
      inputs: {},
      artefacts: {},
    };

    await runner.executeJob(job, {
      movieId: 'movie-alias',
      storage,
      eventLog,
      manifest,
      manifestService,
      layerIndex: 0,
      attempt: 1,
      revision: 'rev-0002',
    });

    expect(observedResolvedInputs?.NarrativeText).toBe('aliased text');
  });

  it('injects fan-in groupings even when no upstream artefacts are resolved', async () => {
    const storage = createStorageContext({ kind: 'memory' });
    await initializeMovieStorage(storage, 'movie-fanin');
    const eventLog = createEventLog(storage);
    const manifestService = createManifestService(storage);

    let observedResolvedInputs: Record<string, unknown> | undefined;

    const runner = createRunner({
      produce: async (request) => {
        observedResolvedInputs = request.job.context?.extras?.resolvedInputs as Record<string, unknown> | undefined;
        return {
          jobId: request.job.jobId,
          status: 'succeeded',
          artefacts: [],
        };
      },
    });

    const fanInJob: JobDescriptor = {
      jobId: 'job-fanin',
      producer: 'TimelineComposer.TimelineProducer',
      inputs: [
        'Input:TimelineComposer.ImageSegments',
        'Input:TimelineComposer.AudioSegments',
      ],
      produces: ['Artifact:TimelineComposer.Timeline'],
      provider: 'tutopanda',
      providerModel: 'OrderedTimeline',
      rateKey: 'timeline:ordered',
      context: {
        namespacePath: ['TimelineComposer'],
        indices: {},
        qualifiedName: 'TimelineComposer.TimelineProducer',
        inputs: [
          'Input:TimelineComposer.ImageSegments',
          'Input:TimelineComposer.AudioSegments',
        ],
        produces: ['Artifact:TimelineComposer.Timeline'],
        fanIn: {
          'Input:TimelineComposer.ImageSegments': {
            groupBy: 'segment',
            orderBy: 'image',
            members: [
              { id: 'Artifact:ImageGenerator.SegmentImage[0][0]', group: 0, order: 0 },
              { id: 'Artifact:ImageGenerator.SegmentImage[1][0]', group: 1, order: 0 },
            ],
          },
          'Input:TimelineComposer.AudioSegments': {
            groupBy: 'segment',
            members: [
              { id: 'Artifact:AudioGenerator.SegmentAudio[0]', group: 0 },
              { id: 'Artifact:AudioGenerator.SegmentAudio[1]', group: 1 },
            ],
          },
        },
      },
    };

    const manifest: Manifest = {
      revision: 'rev-0001',
      baseRevision: null,
      createdAt: new Date().toISOString(),
      inputs: {},
      artefacts: {},
    };

    await runner.executeJob(fanInJob, {
      movieId: 'movie-fanin',
      storage,
      eventLog,
      manifest,
      manifestService,
      layerIndex: 0,
      attempt: 1,
      revision: 'rev-0002',
    });

    expect(observedResolvedInputs).toBeDefined();
    const imageSegments = observedResolvedInputs?.['Input:TimelineComposer.ImageSegments'] as
      | { groupBy: string; orderBy?: string; groups: string[][] }
      | undefined;
    expect(imageSegments?.groupBy).toBe('segment');
    expect(imageSegments?.orderBy).toBe('image');
    expect(imageSegments?.groups).toEqual([
      ['Artifact:ImageGenerator.SegmentImage[0][0]'],
      ['Artifact:ImageGenerator.SegmentImage[1][0]'],
    ]);
    expect(observedResolvedInputs?.['TimelineComposer.ImageSegments']).toEqual(imageSegments);

    const audioSegments = observedResolvedInputs?.['Input:TimelineComposer.AudioSegments'] as
      | { groupBy: string; groups: string[][] }
      | undefined;
    expect(audioSegments?.groupBy).toBe('segment');
    expect(audioSegments?.groups).toEqual([
      ['Artifact:AudioGenerator.SegmentAudio[0]'],
      ['Artifact:AudioGenerator.SegmentAudio[1]'],
    ]);
  });
});
