import { describe, expect, it } from 'vitest';
import { createPlanner, createProducerGraph } from './planner.js';
import { createEventLog } from './event-log.js';
import { createStorageContext, initializeMovieStorage } from './storage.js';
import { createManifestService, ManifestNotFoundError } from './manifest.js';
import { hashPayload } from './hashing.js';
import { nextRevisionId } from './revisions.js';
import type {
  InputEvent,
  Manifest,
  ProducerCatalog,
  ProducerGraph,
  RevisionId,
} from './types.js';
import { expandBlueprint, type BlueprintGraphData, type BlueprintExpansionConfig } from './blueprints.js';

const testCatalog: ProducerCatalog = {
  ScriptProducer: {
    provider: 'openai',
    providerModel: 'openai/GPT-5',
    rateKey: 'llm:script',
    costClass: 'high',
    medianLatencySec: 45,
  },
  TextToMusicPromptProducer: {
    provider: 'openai',
    providerModel: 'openai/GPT-5-mini',
    rateKey: 'llm:music-prompt',
    costClass: 'mid',
    medianLatencySec: 12,
  },
  TextToMusicProducer: {
    provider: 'replicate',
    providerModel: 'stability-ai/stable-audio-2.5',
    rateKey: 'music:stable-audio-2.5',
    costClass: 'high',
    medianLatencySec: 30,
  },
  AudioProducer: {
    provider: 'replicate',
    providerModel: 'elevenlabs/turbo-v2.5',
    rateKey: 'audio:elevenlabs-turbo',
    costClass: 'mid',
    medianLatencySec: 22,
  },
  TextToImagePromptProducer: {
    provider: 'openai',
    providerModel: 'openai/GPT-5-mini',
    rateKey: 'llm:image-prompt',
    costClass: 'mid',
    medianLatencySec: 10,
  },
  TextToImageProducer: {
    provider: 'replicate',
    providerModel: 'bytedance/seedream-4',
    rateKey: 'image:seedream-4',
    costClass: 'high',
    medianLatencySec: 35,
  },
  TextToVideoPromptProducer: {
    provider: 'openai',
    providerModel: 'openai/GPT-5-mini',
    rateKey: 'llm:video-prompt',
    costClass: 'mid',
    medianLatencySec: 10,
  },
  TextToVideoProducer: {
    provider: 'replicate',
    providerModel: 'google/veo-3-fast',
    rateKey: 'video:veo-3-fast',
    costClass: 'high',
    medianLatencySec: 90,
  },
  ImageToVideoPromptProducer: {
    provider: 'openai',
    providerModel: 'openai/GPT-5-mini',
    rateKey: 'llm:image-video-prompt',
    costClass: 'mid',
    medianLatencySec: 10,
  },
  StartImageProducer: {
    provider: 'replicate',
    providerModel: 'google/imagen-4',
    rateKey: 'image:start-imagen-4',
    costClass: 'high',
    medianLatencySec: 30,
  },
  ImageToVideoProducer: {
    provider: 'replicate',
    providerModel: 'bytedance/seedance-1-lite',
    rateKey: 'video:seedance-1-lite',
    costClass: 'high',
    medianLatencySec: 120,
  },
  TimelineAssembler: {
    provider: 'internal',
    providerModel: 'workflow/timeline-assembler',
    rateKey: 'internal:timeline',
    costClass: 'low',
    medianLatencySec: 5,
  },
};

const TEST_BLUEPRINT: BlueprintGraphData = {
  nodes: [
    { ref: { kind: 'InputSource', id: 'InquiryPrompt' }, cardinality: 'single' },
    { ref: { kind: 'Producer', id: 'ScriptProducer' }, cardinality: 'single' },
    { ref: { kind: 'Artifact', id: 'NarrationScript' }, cardinality: 'perSegment' },
    { ref: { kind: 'Producer', id: 'AudioProducer' }, cardinality: 'perSegment' },
    { ref: { kind: 'Artifact', id: 'SegmentAudio' }, cardinality: 'perSegment' },
    { ref: { kind: 'Producer', id: 'TimelineAssembler' }, cardinality: 'single' },
    { ref: { kind: 'Artifact', id: 'FinalVideo' }, cardinality: 'single' },
  ],
  edges: [
    {
      from: { kind: 'InputSource', id: 'InquiryPrompt' },
      to: { kind: 'Producer', id: 'ScriptProducer' },
    },
    {
      from: { kind: 'Producer', id: 'ScriptProducer' },
      to: { kind: 'Artifact', id: 'NarrationScript' },
      dimensions: ['segment'],
    },
    {
      from: { kind: 'Artifact', id: 'NarrationScript' },
      to: { kind: 'Producer', id: 'AudioProducer' },
      dimensions: ['segment'],
    },
    {
      from: { kind: 'Producer', id: 'AudioProducer' },
      to: { kind: 'Artifact', id: 'SegmentAudio' },
      dimensions: ['segment'],
    },
    {
      from: { kind: 'Artifact', id: 'SegmentAudio' },
      to: { kind: 'Producer', id: 'TimelineAssembler' },
    },
    {
      from: { kind: 'Producer', id: 'TimelineAssembler' },
      to: { kind: 'Artifact', id: 'FinalVideo' },
    },
  ],
};

function memoryContext(basePath = 'builds') {
  return createStorageContext({ kind: 'memory', basePath });
}

function blueprintConfig(): BlueprintExpansionConfig {
  return {
    segmentCount: 2,
    imagesPerSegment: 1,
  };
}

function buildProducerGraph(): ProducerGraph {
  const expanded = expandBlueprint(blueprintConfig(), TEST_BLUEPRINT);
  return createProducerGraph(expanded, testCatalog);
}

async function loadManifest(ctx: ReturnType<typeof memoryContext>): Promise<Manifest> {
  const svc = createManifestService(ctx);
  try {
    const { manifest } = await svc.loadCurrent('demo');
    return manifest;
  } catch (error) {
    if (error instanceof ManifestNotFoundError) {
      return {
        revision: 'rev-0000',
        baseRevision: null,
        createdAt: new Date().toISOString(),
        inputs: {},
        artefacts: {},
        timeline: {},
      };
    }
    throw error;
  }
}

function assertTopological(plan: ExecutionPlanLike, graph: ProducerGraph) {
  const order = new Map<string, number>();
  plan.layers.forEach((layer, index) => {
    for (const job of layer) {
      order.set(job.jobId, index);
    }
  });

  for (const edge of graph.edges) {
    if (!order.has(edge.from) || !order.has(edge.to)) {
      continue;
    }
    const fromOrder = order.get(edge.from)!;
    const toOrder = order.get(edge.to)!;
    expect(fromOrder).toBeLessThan(toOrder);
  }
}

type ExecutionPlanLike = Awaited<ReturnType<ReturnType<typeof createPlanner>['computePlan']>>;

function createInputEvents(values: Record<string, unknown>, revision: RevisionId): InputEvent[] {
  const now = new Date().toISOString();
  return Object.entries(values).map(([id, payload]) => {
    const { hash } = hashPayload(payload);
    return {
      id,
      revision,
      payload,
      hash,
      editedBy: 'user',
      createdAt: now,
    } satisfies InputEvent;
  });
}

describe('planner', () => {
  it('produces layered plan for initial run', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const eventLog = createEventLog(ctx);
    const graph = buildProducerGraph();
    const planner = createPlanner();
    const manifest = await loadManifest(ctx);

    const plan = await planner.computePlan({
      movieId: 'demo',
      manifest,
      eventLog,
      blueprint: graph,
      targetRevision: 'rev-0001',
      pendingEdits: [],
    });

    expect(plan.layers.length).toBeGreaterThan(0);
    assertTopological(plan, graph);
  });

  it('returns empty plan when inputs unchanged', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const eventLog = createEventLog(ctx);
    const graph = buildProducerGraph();
    const planner = createPlanner();

    const baseline = createInputEvents({ InquiryPrompt: 'Tell me a story' }, 'rev-0001');
    for (const event of baseline) {
      await eventLog.appendInput('demo', event);
    }

    const manifest: Manifest = {
      revision: 'rev-0001',
      baseRevision: null,
      createdAt: new Date().toISOString(),
      inputs: Object.fromEntries(
        baseline.map((event) => [
          event.id,
          {
            hash: event.hash,
            payloadDigest: hashPayload(event.payload).canonical,
            createdAt: event.createdAt,
          },
        ]),
      ),
      artefacts: {},
      timeline: {},
    };

    const plan = await planner.computePlan({
      movieId: 'demo',
      manifest,
      eventLog,
      blueprint: graph,
      targetRevision: 'rev-0002',
      pendingEdits: [],
    });

    expect(plan.layers).toHaveLength(0);
  });

  it('propagates dirtiness downstream when inputs change', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const eventLog = createEventLog(ctx);
    const graph = buildProducerGraph();
    const planner = createPlanner();

    const baseRevision = 'rev-0001';
    const baseline = createInputEvents({ InquiryPrompt: 'Tell me a story' }, baseRevision);
    for (const event of baseline) {
      await eventLog.appendInput('demo', event);
    }

    const manifest: Manifest = {
      revision: baseRevision,
      baseRevision: null,
      createdAt: new Date().toISOString(),
      inputs: Object.fromEntries(
        baseline.map((event) => [
          event.id,
          {
            hash: event.hash,
            payloadDigest: hashPayload(event.payload).canonical,
            createdAt: event.createdAt,
          },
        ]),
      ),
      artefacts: {},
      timeline: {},
    };

    const nextRevision = nextRevisionId(baseRevision);
    const pending = createInputEvents({ InquiryPrompt: 'An epic voyage' }, nextRevision);

    const plan = await planner.computePlan({
      movieId: 'demo',
      manifest,
      eventLog,
      blueprint: graph,
      targetRevision: nextRevision,
      pendingEdits: pending,
    });

    const jobs = plan.layers.flat();
    expect(jobs.some((job) => job.jobId.includes('Producer:ScriptProducer'))).toBe(true);
    expect(jobs.some((job) => job.jobId.includes('Producer:TimelineAssembler'))).toBe(true);
  });

  it('throws when the graph contains a cycle', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const eventLog = createEventLog(ctx);
    const planner = createPlanner();
    const manifest = await loadManifest(ctx);

    const cyclicGraph: ProducerGraph = {
      nodes: [
        {
          jobId: 'Producer:A',
          producer: 'ProducerA',
          inputs: [],
          produces: ['Artifact:alpha'],
          provider: 'internal',
          providerModel: 'mock/ProducerA',
          rateKey: 'internal:a',
          context: {},
        },
        {
          jobId: 'Producer:B',
          producer: 'ProducerB',
          inputs: ['Artifact:alpha'],
          produces: ['Artifact:beta'],
          provider: 'internal',
          providerModel: 'mock/ProducerB',
          rateKey: 'internal:b',
          context: {},
        },
      ],
      edges: [
        { from: 'Producer:A', to: 'Producer:B' },
        { from: 'Producer:B', to: 'Producer:A' },
      ],
    };

    await expect(
      planner.computePlan({
        movieId: 'demo',
        manifest,
        eventLog,
        blueprint: cyclicGraph,
        targetRevision: 'rev-0001',
        pendingEdits: [],
      }),
    ).rejects.toThrow(/cycle/i);
  });
});
