import type {
  CanonicalBlueprint,
  CanonicalNodeInstance,
} from './canonical-expander.js';
import type { EventLog } from './event-log.js';
import { hashPayload } from './hashing.js';
import {
  type Clock,
  type ExecutionPlan,
  type InputEvent,
  type Manifest,
  type ArtefactEvent,
  type ProducerJobContext,
  type ProducerCatalog,
  type ProducerGraph,
  type ProducerGraphEdge,
  type ProducerGraphNode,
  type ProducerKind,
  type RevisionId,
  type FanInDescriptor,
} from './types.js';
import type { Logger } from './logger.js';

interface PlannerOptions {
  logger?: PlannerLogger;
  clock?: Clock;
}

/* eslint-disable no-unused-vars */
export interface PlannerLogger extends Partial<Logger> {}

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
  canonical: CanonicalBlueprint,
  catalog: ProducerCatalog,
): ProducerGraph {
  const nodeMap = new Map(canonical.nodes.map((node) => [node.id, node]));
  const artefactProducers = computeArtefactProducers(canonical, nodeMap);

  const nodes: ProducerGraphNode[] = [];
  const edges: ProducerGraphEdge[] = [];
  const edgeSet = new Set<string>();

  for (const node of canonical.nodes) {
    if (node.type !== 'Producer') {
      continue;
    }

    const inboundInputs = canonical.edges.filter((edge) => edge.to === node.id).map((edge) => edge.from);
    const producedArtefacts = canonical.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => edge.to)
      .filter((id) => id.startsWith('Artifact:'));

    const qualifiedProducerName = node.qualifiedName;
    const baseProducerName = node.producer?.name ?? node.name;
    const catalogEntry =
      resolveCatalogEntry(qualifiedProducerName, catalog)
      ?? resolveCatalogEntry(baseProducerName, catalog);
    if (!catalogEntry) {
      throw new Error(`Missing producer catalog entry for ${qualifiedProducerName}`);
    }

    const fanInSpecs = canonical.fanIn;
    const fanInForJob: Record<string, FanInDescriptor> = {};
    if (fanInSpecs) {
      for (const inputId of inboundInputs) {
        const spec = fanInSpecs[inputId];
        if (spec) {
          fanInForJob[inputId] = spec;
        }
      }
    }

    const dependencyKeys = new Set(inboundInputs.filter((key) => key.startsWith('Artifact:')));
    for (const spec of Object.values(fanInForJob)) {
      for (const member of spec.members) {
        dependencyKeys.add(member.id);
      }
    }

    for (const dependencyKey of dependencyKeys) {
      const upstream = artefactProducers.get(dependencyKey);
      if (upstream && upstream !== node.id) {
        const edgeKey = `${upstream}->${node.id}`;
        if (!edgeSet.has(edgeKey)) {
          edges.push({ from: upstream, to: node.id });
          edgeSet.add(edgeKey);
        }
      }
    }

    const inputBindings = canonical.inputBindings[node.id];
    const nodeContext: ProducerJobContext = {
      namespacePath: node.namespacePath,
      indices: node.indices,
      qualifiedName: qualifiedProducerName,
      inputs: inboundInputs,
      produces: producedArtefacts,
      inputBindings: inputBindings && Object.keys(inputBindings).length > 0 ? inputBindings : undefined,
      sdkMapping: node.producer?.sdkMapping,
      outputs: node.producer?.outputs,
      fanIn: Object.keys(fanInForJob).length > 0 ? fanInForJob : undefined,
    };
    nodes.push({
      jobId: node.id,
      producer: baseProducerName,
      inputs: inboundInputs,
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

function computeArtefactProducers(
  canonical: CanonicalBlueprint,
  nodeMap: Map<string, CanonicalNodeInstance>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const edge of canonical.edges) {
    const fromNode = nodeMap.get(edge.from);
    const toNode = nodeMap.get(edge.to);
    if (!fromNode || !toNode) {
      continue;
    }
    if (fromNode.type === 'Producer' && toNode.type === 'Artifact') {
      map.set(edge.to, edge.from);
    }
  }
  return map;
}

function extractInputBaseId(input: string): string | null {
  if (!input.startsWith('Input:')) {
    return null;
  }
  const withoutPrefix = input.slice('Input:'.length);
  const bracket = withoutPrefix.indexOf('[');
  const base = bracket >= 0 ? withoutPrefix.slice(0, bracket) : withoutPrefix;
  return base;
}
