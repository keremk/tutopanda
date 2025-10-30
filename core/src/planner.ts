import { expandBlueprint } from './blueprints.js';
import type {
  BlueprintExpansionConfig,
  ExpandedBlueprint,
  PlannedEdgeInstance,
  PlannedNodeInstance,
} from './blueprints.js';
import type { EventLog } from './event-log.js';
import { hashPayload } from './hashing.js';
import {
  type Clock,
  type ExecutionPlan,
  type InputEvent,
  type Manifest,
  type ProducerGraph,
  type ProducerGraphEdge,
  type ProducerGraphNode,
  type RevisionId,
} from './types.js';

interface PlannerOptions {
  logger?: PlannerLogger;
  clock?: Clock;
}

export interface PlannerLogger {
  info?(message: string, meta?: Record<string, unknown>): void;
  warn?(message: string, meta?: Record<string, unknown>): void;
  error?(message: string, meta?: Record<string, unknown>): void;
  debug?(message: string, meta?: Record<string, unknown>): void;
}

interface ComputePlanArgs {
  movieId: string;
  manifest: Manifest | null;
  eventLog: EventLog;
  blueprint: ProducerGraph;
  targetRevision: RevisionId;
  pendingEdits?: InputEvent[];
}

interface GraphMetadata {
  node: ProducerGraphNode;
  inputBases: Set<string>;
}

type InputsMap = Map<string, InputEvent>;

export function createPlanner(options: PlannerOptions = {}) {
  const logger = options.logger ?? {};
  const clock = options.clock;

  return {
    async computePlan(args: ComputePlanArgs): Promise<ExecutionPlan> {
      const manifest = args.manifest ?? createEmptyManifest();
      const eventLog = args.eventLog;
      const pendingEdits = args.pendingEdits ?? [];
      const blueprint = args.blueprint;

      const latestInputs = await readLatestInputs(eventLog, args.movieId);
      const combinedInputs = mergeInputs(latestInputs, pendingEdits);
      const dirtyInputs = determineDirtyInputs(manifest, combinedInputs);

      const metadata = buildGraphMetadata(blueprint);
      const initialDirty = determineInitialDirtyJobs(manifest, metadata, dirtyInputs);
      const dirtyJobs = propagateDirtyJobs(initialDirty, blueprint);
      const layers = buildExecutionLayers(dirtyJobs, metadata, blueprint);

      logger.debug?.('planner.plan.generated', {
        movieId: args.movieId,
        layers: layers.length,
        jobs: dirtyJobs.size,
      });

      return {
        revision: args.targetRevision,
        manifestBaseHash: manifestBaseHash(manifest),
        layers,
        createdAt: nowIso(clock),
      };
    },
  };
}

export function createProducerGraphFromConfig(
  config: BlueprintExpansionConfig,
): ProducerGraph {
  const expanded = expandBlueprint(config);
  return createProducerGraph(expanded);
}

export function createProducerGraph(expanded: ExpandedBlueprint): ProducerGraph {
  const nodeMap = new Map(expanded.nodes.map((node) => [node.key, node]));
  const producerNodes = expanded.nodes.filter(
    (node) => node.ref.kind === 'Producer' && node.active,
  );

  const artefactProducers = computeArtefactProducers(expanded.edges, nodeMap);

  const nodes: ProducerGraphNode[] = [];
  const edges: ProducerGraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const producer of producerNodes) {
    const rawInputs = collectInputDependencies(producer, expanded.edges, nodeMap);
    const canonicalInputs = canonicalizeInputs(rawInputs);
    const producedArtefacts = collectProducedArtefacts(producer, expanded.edges, nodeMap).map(
      canonicalizeArtifactKey,
    );

    for (const dependencyKey of rawInputs) {
      if (!dependencyKey.startsWith('Artifact:')) {
        continue;
      }
      const upstream = artefactProducers.get(dependencyKey);
      if (upstream && upstream !== producer.key) {
        const edgeKey = `${upstream}->${producer.key}`;
        if (!edgeSet.has(edgeKey)) {
          edges.push({ from: upstream, to: producer.key });
          edgeSet.add(edgeKey);
        }
      }
    }

    nodes.push({
      jobId: producer.key,
      producer: producer.ref.id,
      inputs: canonicalInputs,
      produces: producedArtefacts,
      context: {
        index: producer.index,
        label: producer.label,
        description: producer.description,
      },
    });
  }

  return { nodes, edges };
}

function buildGraphMetadata(blueprint: ProducerGraph): Map<string, GraphMetadata> {
  const metadata = new Map<string, GraphMetadata>();
  for (const node of blueprint.nodes) {
    metadata.set(node.jobId, {
      node,
      inputBases: new Set(
        node.inputs
          .map(extractInputBaseId)
          .filter((value): value is string => value !== null),
      ),
    });
  }
  return metadata;
}

function determineInitialDirtyJobs(
  manifest: Manifest,
  metadata: Map<string, GraphMetadata>,
  dirtyInputs: Set<string>,
): Set<string> {
  const dirtyJobs = new Set<string>();
  const isInitial = Object.keys(manifest.inputs).length === 0;

  for (const [jobId, info] of metadata) {
    if (isInitial) {
      dirtyJobs.add(jobId);
      continue;
    }
    const touchesDirtyInput = Array.from(info.inputBases).some((id) =>
      dirtyInputs.has(id),
    );
    if (touchesDirtyInput) {
      dirtyJobs.add(jobId);
    }
  }

  return dirtyJobs;
}

function propagateDirtyJobs(initialDirty: Set<string>, blueprint: ProducerGraph): Set<string> {
  const dirty = new Set(initialDirty);
  const queue = Array.from(initialDirty);
  const adjacency = buildAdjacencyMap(blueprint);

  while (queue.length > 0) {
    const jobId = queue.shift()!;
    const neighbours = adjacency.get(jobId);
    if (!neighbours) {
      continue;
    }
    for (const next of neighbours) {
      if (!dirty.has(next)) {
        dirty.add(next);
        queue.push(next);
      }
    }
  }

  return dirty;
}

function buildExecutionLayers(
  dirtyJobs: Set<string>,
  metadata: Map<string, GraphMetadata>,
  blueprint: ProducerGraph,
): ExecutionPlan['layers'] {
  const indegree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();

  for (const jobId of dirtyJobs) {
    indegree.set(jobId, 0);
    adjacency.set(jobId, new Set());
  }

  for (const edge of blueprint.edges) {
    if (!dirtyJobs.has(edge.from) || !dirtyJobs.has(edge.to)) {
      continue;
    }
    adjacency.get(edge.from)!.add(edge.to);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  const ready: string[] = [];
  for (const [jobId, degree] of indegree) {
    if (degree === 0) {
      ready.push(jobId);
    }
  }

  const layers: ExecutionPlan['layers'] = [];

  while (ready.length > 0) {
    const currentJobIds = ready.splice(0, ready.length);
    const nextReady: string[] = [];
    const layer: ExecutionPlan['layers'][number] = [];

    for (const jobId of currentJobIds) {
      const info = metadata.get(jobId);
      if (!info) {
        continue;
      }
      layer.push({
        jobId: info.node.jobId,
        producer: info.node.producer,
        inputs: info.node.inputs,
        context: info.node.context,
      });

      const neighbours = adjacency.get(jobId);
      if (!neighbours) {
        continue;
      }
      for (const neighbour of neighbours) {
        const remaining = (indegree.get(neighbour) ?? 0) - 1;
        indegree.set(neighbour, remaining);
        if (remaining === 0) {
          nextReady.push(neighbour);
        }
      }
    }

    layers.push(layer);
    ready.push(...nextReady);
  }

  ensureNoCycles(indegree);

  return layers;
}

function ensureNoCycles(indegree: Map<string, number>): void {
  const remaining = Array.from(indegree.values()).filter((value) => value > 0);
  if (remaining.length > 0) {
    throw new Error('Producer graph contains a cycle. Unable to create execution plan.');
  }
}

function buildAdjacencyMap(blueprint: ProducerGraph): Map<string, Set<string>> {
  const adjacency = new Map<string, Set<string>>();
  for (const node of blueprint.nodes) {
    adjacency.set(node.jobId, new Set());
  }
  for (const edge of blueprint.edges) {
    if (!adjacency.has(edge.from)) {
      adjacency.set(edge.from, new Set());
    }
    adjacency.get(edge.from)!.add(edge.to);
  }
  return adjacency;
}

async function readLatestInputs(eventLog: EventLog, movieId: string): Promise<InputsMap> {
  const inputs = new Map<string, InputEvent>();
  for await (const event of eventLog.streamInputs(movieId)) {
    inputs.set(event.id, event);
  }
  return inputs;
}

function mergeInputs(latest: InputsMap, pending: InputEvent[]): InputsMap {
  const merged = new Map(latest);
  for (const event of pending) {
    merged.set(event.id, event);
  }
  return merged;
}

function determineDirtyInputs(manifest: Manifest, inputs: InputsMap): Set<string> {
  const dirty = new Set<string>();
  for (const [id, event] of inputs) {
    const record = manifest.inputs[id];
    if (!record || record.hash !== event.hash) {
      dirty.add(id);
    }
  }
  return dirty;
}

function manifestBaseHash(manifest: Manifest): string {
  return hashPayload(manifest).hash;
}

function nowIso(clock?: Clock): string {
  return clock?.now() ?? new Date().toISOString();
}

function createEmptyManifest(): Manifest {
  return {
    revision: 'rev-0000',
    baseRevision: null,
    createdAt: new Date().toISOString(),
    inputs: {},
    artefacts: {},
    timeline: {},
  };
}

function collectInputDependencies(
  producer: PlannedNodeInstance,
  edges: PlannedEdgeInstance[],
  nodeMap: Map<string, PlannedNodeInstance>,
): string[] {
  const dependencies: string[] = [];
  for (const edge of edges) {
    if (edge.to !== producer.key) {
      continue;
    }
    const fromNode = nodeMap.get(edge.from);
    if (!fromNode || !fromNode.active) {
      continue;
    }
    dependencies.push(edge.from);
  }
  return dependencies;
}

function collectProducedArtefacts(
  producer: PlannedNodeInstance,
  edges: PlannedEdgeInstance[],
  nodeMap: Map<string, PlannedNodeInstance>,
): string[] {
  const outputs: string[] = [];
  for (const edge of edges) {
    if (edge.from !== producer.key) {
      continue;
    }
    const toNode = nodeMap.get(edge.to);
    if (!toNode || !toNode.active || toNode.ref.kind !== 'Artifact') {
      continue;
    }
    outputs.push(edge.to);
  }
  return outputs;
}

function computeArtefactProducers(
  edges: PlannedEdgeInstance[],
  nodeMap: Map<string, PlannedNodeInstance>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) {
      continue;
    }
    if (fromNode.ref.kind === 'Producer' && toNode.ref.kind === 'Artifact') {
      map.set(edge.to, edge.from);
    }
  }
  return map;
}

function canonicalizeInputs(inputs: string[]): string[] {
  return inputs.map((key) => {
    if (key.startsWith('InputSource:')) {
      return `Input:${key.slice('InputSource:'.length)}`;
    }
    return canonicalizeArtifactKey(key);
  });
}

function canonicalizeArtifactKey(key: string): string {
  if (key.startsWith('Artifact:')) {
    return `Artifact:${key.slice('Artifact:'.length)}`;
  }
  return `Artifact:${key}`;
}

function extractInputBaseId(input: string): string | null {
  if (!input.startsWith('Input:')) {
    return null;
  }
  const withoutPrefix = input.slice('Input:'.length);
  const bracket = withoutPrefix.indexOf('[');
  return bracket >= 0 ? withoutPrefix.slice(0, bracket) : withoutPrefix;
}
