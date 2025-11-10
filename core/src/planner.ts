import type {
  ExpandedBlueprint,
  PlannedEdgeInstance,
  PlannedNodeInstance,
} from './blueprints.js';
import type { EventLog } from './event-log.js';
import { hashArtefactOutput, hashPayload } from './hashing.js';
import {
  type Clock,
  type ExecutionPlan,
  type InputEvent,
  type Manifest,
  type ArtefactEvent,
  type ProducerCatalog,
  type ProducerGraph,
  type ProducerGraphEdge,
  type ProducerGraphNode,
  type ProducerKind,
  type RevisionId,
} from './types.js';

interface PlannerOptions {
  logger?: PlannerLogger;
  clock?: Clock;
}

/* eslint-disable no-unused-vars */
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
  artefactInputs: Set<string>;
}

type InputsMap = Map<string, InputEvent>;
type ArtefactMap = Map<string, ArtefactEvent>;

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
      const latestArtefacts = await readLatestArtefacts(eventLog, args.movieId);
      const dirtyArtefacts = determineDirtyArtefacts(manifest, latestArtefacts);

      const metadata = buildGraphMetadata(blueprint);
      const initialDirty = determineInitialDirtyJobs(
        manifest,
        metadata,
        dirtyInputs,
        dirtyArtefacts,
      );
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

export function createProducerGraph(
  expanded: ExpandedBlueprint,
  catalog: ProducerCatalog,
): ProducerGraph {
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
    const inputAliasMap = buildInputAliasMap(producer.key, expanded.edges, nodeMap);
    const canonicalInputs = canonicalizeInputs(rawInputs);
    const producedArtefacts = collectProducedArtefacts(producer, expanded.edges, nodeMap).map(
      canonicalizeArtifactKey,
    );
    const catalogEntry = resolveCatalogEntry(producer.ref.id as string, catalog);
    if (!catalogEntry) {
      throw new Error(`Missing producer catalog entry for ${producer.ref.id}`);
    }

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

    const nodeContext: Record<string, unknown> = {
      index: producer.index,
      label: producer.label,
      description: producer.description,
    };
    if (Object.keys(inputAliasMap).length > 0) {
      nodeContext.inputAliases = inputAliasMap;
    }
    nodes.push({
      jobId: producer.key,
      producer: producer.ref.id,
      inputs: canonicalInputs,
      produces: producedArtefacts,
      provider: catalogEntry.provider,
      providerModel: catalogEntry.providerModel,
      rateKey: catalogEntry.rateKey,
      context: nodeContext,
    });
  }

  return { nodes, edges };
}

function buildGraphMetadata(blueprint: ProducerGraph): Map<string, GraphMetadata> {
  const metadata = new Map<string, GraphMetadata>();
  for (const node of blueprint.nodes) {
    const artefactInputs = node.inputs.filter((input) => input.startsWith('Artifact:'));
    metadata.set(node.jobId, {
      node,
      inputBases: new Set(
        node.inputs
          .map(extractInputBaseId)
          .filter((value): value is string => value !== null),
      ),
      artefactInputs: new Set(artefactInputs),
    });
  }
  return metadata;
}

function resolveCatalogEntry(id: string, catalog: ProducerCatalog) {
  if (catalog[id as ProducerKind]) {
    return catalog[id as ProducerKind];
  }
  const baseId = id.includes('.') ? id.split('.').pop() : id;
  return baseId ? catalog[baseId as ProducerKind] : undefined;
}

function determineInitialDirtyJobs(
  manifest: Manifest,
  metadata: Map<string, GraphMetadata>,
  dirtyInputs: Set<string>,
  dirtyArtefacts: Set<string>,
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
    const touchesDirtyArtefact = Array.from(info.artefactInputs).some((artefactId) =>
      dirtyArtefacts.has(artefactId),
    );
    if (touchesDirtyInput || touchesDirtyArtefact) {
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
        produces: info.node.produces,
        provider: info.node.provider,
        providerModel: info.node.providerModel,
        rateKey: info.node.rateKey,
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

async function readLatestArtefacts(eventLog: EventLog, movieId: string): Promise<ArtefactMap> {
  const artefacts = new Map<string, ArtefactEvent>();
  for await (const event of eventLog.streamArtefacts(movieId)) {
    if (event.status !== 'succeeded') {
      continue;
    }
    artefacts.set(event.artefactId, event);
  }
  return artefacts;
}

function determineDirtyArtefacts(manifest: Manifest, artefacts: ArtefactMap): Set<string> {
  const dirty = new Set<string>();
  for (const [id, event] of artefacts) {
    const manifestEntry = manifest.artefacts[id];
    const eventHash = deriveArtefactHash(event);
    if (!manifestEntry || manifestEntry.hash !== eventHash) {
      dirty.add(id);
    }
  }
  return dirty;
}

function deriveArtefactHash(event: ArtefactEvent): string {
  if (event.output.blob?.hash) {
    return event.output.blob.hash;
  }
  if (event.output.inline !== undefined) {
    return hashArtefactOutput({ inline: event.output.inline });
  }
  return hashPayload({
    artefactId: event.artefactId,
    revision: event.revision,
  }).hash;
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
  const upstreamArtefacts = new Set<string>();

  for (const edge of edges) {
    if (edge.to !== producer.key) {
      continue;
    }
    const fromNode = nodeMap.get(edge.from);
    if (!fromNode || !fromNode.active) {
      continue;
    }
    dependencies.push(edge.from);

    if (fromNode.ref.kind === 'InputSource') {
      const artefactKeys = collectUpstreamArtefacts(edge.from, edges, nodeMap, new Set());
      for (const artefactKey of artefactKeys) {
        if (!upstreamArtefacts.has(artefactKey)) {
          upstreamArtefacts.add(artefactKey);
          dependencies.push(artefactKey);
        }
      }
    }
  }

  return dependencies;
}

function buildInputAliasMap(
  producerKey: string,
  edges: PlannedEdgeInstance[],
  nodeMap: Map<string, PlannedNodeInstance>,
): Record<string, string[]> {
  const aliasMap = new Map<string, Set<string>>();

  for (const edge of edges) {
    if (edge.to !== producerKey) {
      continue;
    }
    if (!edge.from.startsWith('InputSource:')) {
      continue;
    }
    const upstreamArtefacts = collectUpstreamArtefacts(edge.from, edges, nodeMap, new Set());
    if (upstreamArtefacts.length === 0) {
      continue;
    }
    const normalizedInputKey = normalizeInputNodeKey(edge.from);
    const baseId = normalizedInputKey.slice('InputSource:'.length);
    const inputName = stripDimensions(normalizeInputId(baseId));
    const target = aliasMap.get(inputName) ?? new Set<string>();
    for (const artefactKey of upstreamArtefacts) {
      const canonical = canonicalizeArtifactKey(artefactKey);
      target.add(canonical);
    }
    aliasMap.set(inputName, target);
  }

  const result: Record<string, string[]> = {};
  for (const [inputName, sources] of aliasMap) {
    result[inputName] = Array.from(sources);
  }
  return result;
}

function collectUpstreamArtefacts(
  inputKey: string,
  edges: PlannedEdgeInstance[],
  nodeMap: Map<string, PlannedNodeInstance>,
  visited: Set<string>,
): string[] {
  if (visited.has(inputKey)) {
    return [];
  }
  visited.add(inputKey);

  const artefacts: string[] = [];
  const normalizedInputKey = normalizeInputNodeKey(inputKey);

  for (const edge of edges) {
    if (!inputNodeKeysMatch(edge.to, normalizedInputKey)) {
      continue;
    }
    const fromNode = nodeMap.get(edge.from);
    if (!fromNode || !fromNode.active) {
      continue;
    }

    if (fromNode.ref.kind === 'Artifact') {
      artefacts.push(edge.from);
      continue;
    }

    if (fromNode.ref.kind === 'InputSource') {
      artefacts.push(...collectUpstreamArtefacts(edge.from, edges, nodeMap, visited));
    }
  }

  return artefacts;
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
      return formatInputKey(key.slice('InputSource:'.length));
    }
    if (key.startsWith('Input:')) {
      return formatInputKey(key.slice('Input:'.length));
    }
    return canonicalizeArtifactKey(key);
  });
}

function formatInputKey(raw: string): string {
  const normalized = normalizeInputId(raw);
  return `Input:${normalized}`;
}

function canonicalizeArtifactKey(key: string): string {
  if (key.startsWith('Artifact:')) {
    return `Artifact:${key.slice('Artifact:'.length)}`;
  }
  return `Artifact:${key}`;
}

function stripDimensions(id: string): string {
  const bracket = id.indexOf('[');
  return bracket >= 0 ? id.slice(0, bracket) : id;
}

function extractInputBaseId(input: string): string | null {
  if (!input.startsWith('Input:')) {
    return null;
  }
  const withoutPrefix = input.slice('Input:'.length);
  const bracket = withoutPrefix.indexOf('[');
  const base = bracket >= 0 ? withoutPrefix.slice(0, bracket) : withoutPrefix;
  return normalizeInputId(base);
}

function normalizeInputId(id: string): string {
  if (id.includes('.')) {
    return id.split('.').pop() ?? id;
  }
  return id;
}

function normalizeInputNodeKey(key: string): string {
  if (!key.startsWith('InputSource:')) {
    return key;
  }
  const remainder = key.slice('InputSource:'.length);
  const bracketIndex = remainder.indexOf('[');
  const idPart = bracketIndex >= 0 ? remainder.slice(0, bracketIndex) : remainder;
  const dimsPart = bracketIndex >= 0 ? remainder.slice(bracketIndex) : '';
  const baseId = idPart.includes('.') ? idPart.split('.').pop() ?? idPart : idPart;
  return `InputSource:${baseId}${dimsPart}`;
}

function inputNodeKeysMatch(candidate: string, normalized: string): boolean {
  if (!candidate.startsWith('InputSource:')) {
    return candidate === normalized;
  }
  return normalizeInputNodeKey(candidate) === normalized;
}
