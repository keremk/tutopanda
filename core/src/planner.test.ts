import { describe, expect, it } from 'vitest';
import { createPlanner, createProducerGraphFromConfig } from './planner.js';
import { createEventLog } from './event-log.js';
import { createStorageContext, initializeMovieStorage } from './storage.js';
import { createManifestService, ManifestNotFoundError } from './manifest.js';
import { hashPayload } from './hashing.js';
import { nextRevisionId } from './revisions.js';
import type {
  BlueprintExpansionConfig,
  InputEvent,
  Manifest,
  ProducerGraph,
} from './types.js';

function memoryContext(basePath = 'builds') {
  return createStorageContext({ kind: 'memory', basePath });
}

function blueprintConfig(): BlueprintExpansionConfig {
  return {
    segmentCount: 2,
    imagesPerSegment: 1,
    useVideo: false,
    isImageToVideo: false,
  };
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
    expect(order.get(edge.from)).toBeLessThan(order.get(edge.to));
  }
}

type ExecutionPlanLike = Awaited<ReturnType<ReturnType<typeof createPlanner>['computePlan']>>;

function createInputEvents(values: Record<string, unknown>, revision: string): InputEvent[] {
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
    const graph = createProducerGraphFromConfig(blueprintConfig());
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
    const graph = createProducerGraphFromConfig(blueprintConfig());
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
    const graph = createProducerGraphFromConfig(blueprintConfig());
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
        { jobId: 'Producer:A', producer: 'ProducerA', inputs: [], produces: ['Artifact:alpha'], context: {} },
        { jobId: 'Producer:B', producer: 'ProducerB', inputs: ['Artifact:alpha'], produces: ['Artifact:beta'], context: {} },
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
