import { buildBlueprintGraph } from '../canonical-graph.js';
import { expandBlueprintGraph } from '../canonical-expander.js';
import type { EventLog } from '../event-log.js';
import { hashPayload } from '../hashing.js';
import { ManifestNotFoundError, type ManifestService } from '../manifest.js';
import { createProducerGraph, createPlanner, type PlannerLogger } from '../planner.js';
import { nextRevisionId } from '../revisions.js';
import { planStore, type StorageContext } from '../storage.js';
import type { Clock } from '../types.js';
import type {
  ArtefactEvent,
  ArtefactEventOutput,
  ArtefactEventStatus,
  BlueprintTreeNode,
  ExecutionPlan,
  InputEvent,
  InputEventSource,
  Manifest,
  ProducerCatalog,
  RevisionId,
} from '../types.js';

export interface PendingArtefactDraft {
  artefactId: string;
  producedBy: string;
  output: ArtefactEventOutput;
  inputsHash?: string;
  status?: ArtefactEventStatus;
  diagnostics?: Record<string, unknown>;
}

export interface GeneratePlanArgs {
  movieId: string;
  blueprintTree: BlueprintTreeNode;
  inputValues: Record<string, unknown>;
  providerCatalog: ProducerCatalog;
  storage: StorageContext;
  manifestService: ManifestService;
  eventLog: EventLog;
  pendingArtefacts?: PendingArtefactDraft[];
  inputSource?: InputEventSource;
}

export interface GeneratePlanResult {
  plan: ExecutionPlan;
  planPath: string;
  targetRevision: RevisionId;
  manifest: Manifest;
  manifestHash: string | null;
  inputEvents: InputEvent[];
  resolvedInputs: Record<string, unknown>;
}

export interface PlanningServiceOptions {
  logger?: PlannerLogger;
  clock?: Clock;
}

export interface PlanningService {
  generatePlan(args: GeneratePlanArgs): Promise<GeneratePlanResult>;
}

export function createPlanningService(options: PlanningServiceOptions = {}): PlanningService {
  const planner = createPlanner({
    logger: options.logger,
    clock: options.clock,
  });

  return {
    async generatePlan(args) {
      const now = () => options.clock?.now() ?? new Date().toISOString();

      const { manifest, hash: manifestHash } = await loadOrCreateManifest(
        args.manifestService,
        args.movieId,
        now,
      );

      let targetRevision = nextRevisionId(manifest.revision ?? null);
      targetRevision = await ensureUniquePlanRevision(args.storage, args.movieId, targetRevision);

      const inputEvents = createInputEvents(
        args.inputValues,
        targetRevision,
        args.inputSource ?? 'user',
        now(),
      );
      for (const event of inputEvents) {
        await args.eventLog.appendInput(args.movieId, event);
      }
      const resolvedInputs = buildResolvedInputMap(inputEvents);
      seedBlueprintInputDefaults(args.blueprintTree, resolvedInputs);

      const artefactEvents = (args.pendingArtefacts ?? []).map((draft) =>
        makeArtefactEvent(draft, targetRevision, now()),
      );
      for (const artefactEvent of artefactEvents) {
        await args.eventLog.appendArtefact(args.movieId, artefactEvent);
      }

      const blueprintGraph = buildBlueprintGraph(args.blueprintTree);
      const canonicalBlueprint = expandBlueprintGraph(blueprintGraph, args.inputValues);
      const producerGraph = createProducerGraph(canonicalBlueprint, args.providerCatalog);

      const plan = await planner.computePlan({
        movieId: args.movieId,
        manifest,
        eventLog: args.eventLog,
        blueprint: producerGraph,
        targetRevision,
        pendingEdits: inputEvents,
      });

      await planStore.save(plan, { movieId: args.movieId, storage: args.storage });
      const planPath = args.storage.resolve(args.movieId, 'runs', `${targetRevision}-plan.json`);

      return {
        plan,
        planPath,
        targetRevision,
        manifest,
        manifestHash,
        inputEvents,
        resolvedInputs,
      };
    },
  };
}

async function loadOrCreateManifest(
  service: ManifestService,
  movieId: string,
  now: () => string,
): Promise<{ manifest: Manifest; hash: string | null }> {
  try {
    const { manifest, hash } = await service.loadCurrent(movieId);
    return { manifest, hash };
  } catch (error) {
    if (error instanceof ManifestNotFoundError) {
      return {
        manifest: {
          revision: 'rev-0000',
          baseRevision: null,
          createdAt: now(),
          inputs: {},
          artefacts: {},
          timeline: {},
        },
        hash: null,
      };
    }
    throw error;
  }
}

function createInputEvents(
  inputValues: Record<string, unknown>,
  revision: RevisionId,
  editedBy: InputEventSource,
  createdAt: string,
): InputEvent[] {
  const events: InputEvent[] = [];
  for (const [id, payload] of Object.entries(inputValues)) {
    if (payload === undefined) {
      continue;
    }
    events.push(makeInputEvent(id, payload, revision, editedBy, createdAt));
  }
  return events;
}

function buildResolvedInputMap(events: InputEvent[]): Record<string, unknown> {
  const resolved = new Map<string, unknown>();
  for (const event of events) {
    resolved.set(event.id, event.payload);
  }
  return Object.fromEntries(resolved.entries());
}

function makeInputEvent(
  id: string,
  payload: unknown,
  revision: RevisionId,
  editedBy: InputEventSource,
  createdAt: string,
): InputEvent {
  const { hash } = hashPayload(payload);
  return {
    id,
    revision,
    payload,
    hash,
    editedBy,
    createdAt,
  };
}

function makeArtefactEvent(
  draft: PendingArtefactDraft,
  revision: RevisionId,
  createdAt: string,
): ArtefactEvent {
  return {
    artefactId: draft.artefactId,
    revision,
    inputsHash: draft.inputsHash ?? 'manual-edit',
    output: draft.output,
    status: draft.status ?? 'succeeded',
    producedBy: draft.producedBy,
    diagnostics: draft.diagnostics,
    createdAt,
  };
}

async function ensureUniquePlanRevision(
  storage: StorageContext,
  movieId: string,
  initial: RevisionId,
): Promise<RevisionId> {
  let candidate = initial;
  while (await planExists(storage, movieId, candidate)) {
    candidate = nextRevisionId(candidate);
  }
  return candidate;
}

function seedBlueprintInputDefaults(
  tree: BlueprintTreeNode,
  resolvedInputs: Record<string, unknown>,
): void {
  const namespace = tree.namespacePath;
  for (const input of tree.document.inputs) {
    if (input.defaultValue === undefined) {
      continue;
    }
    const canonicalId = formatCanonicalInputId(namespace, input.name);
    if (resolvedInputs[canonicalId] === undefined) {
      resolvedInputs[canonicalId] = input.defaultValue;
    }
  }
  for (const child of tree.children.values()) {
    seedBlueprintInputDefaults(child, resolvedInputs);
  }
}

function formatCanonicalInputId(namespacePath: string[], name: string): string {
  if (namespacePath.length === 0) {
    return `Input:${name}`;
  }
  return `Input:${namespacePath.join('.')}.${name}`;
}

async function planExists(
  storage: StorageContext,
  movieId: string,
  revision: RevisionId,
): Promise<boolean> {
  const planPath = storage.resolve(movieId, 'runs', `${revision}-plan.json`);
  return storage.storage.fileExists(planPath);
}
