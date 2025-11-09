/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStorageContext,
  initializeMovieStorage,
  createManifestService,
  ManifestNotFoundError,
  createEventLog,
  createProducerGraph,
  expandBlueprint,
  createPlanner,
  planStore,
  hashPayload,
  nextRevisionId,
  type BlueprintEdge,
  type InputEvent,
  type Manifest,
  type RevisionId,
  type ExecutionPlan,
  type StorageContext,
} from 'tutopanda-core';
import type { CliConfig } from './cli-config.js';
import { writePromptFile } from './prompts.js';
import { loadBlueprintFromToml } from './blueprint-loader/index.js';
import { loadInputsFromToml, deriveExpansionConfig, type InputMap } from './input-loader.js';
import {
  buildProducerOptionsFromBlueprint,
  buildProducerCatalog,
  type ProducerOptionsMap,
} from './producer-options.js';
import type { BlueprintGraphData } from 'tutopanda-core';
import { expandPath } from './path.js';

const console = globalThis.console;
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BLUEPRINT_PATH = resolve(__dirname, '../../blueprints/audio-only.toml');

export interface GeneratePlanOptions {
  cliConfig: CliConfig;
  movieId: string; // storage movie id (e.g., movie-q123)
  isNew: boolean;
  inputsPath: string;
  usingBlueprint?: string; // Path to blueprint TOML file
}

export interface GeneratePlanResult {
  planPath: string;
  targetRevision: string;
  inputEvents: InputEvent[];
  manifest: Manifest;
  plan: ExecutionPlan;
  manifestHash: string | null;
  resolvedInputs: Record<string, unknown>;
  providerOptions: ProducerOptionsMap;
}

export async function generatePlan(options: GeneratePlanOptions): Promise<GeneratePlanResult> {
  const { cliConfig, movieId } = options;
  const storageRoot = cliConfig.storage.root;
  const basePath = cliConfig.storage.basePath;
  const movieDir = resolve(storageRoot, basePath, movieId);

  await mkdir(movieDir, { recursive: true });

  const storageContext = createStorageContext({
    kind: 'local',
    rootDir: storageRoot,
    basePath,
  });

  await initializeMovieStorage(storageContext, movieId);

  const manifestService = createManifestService(storageContext);
  const eventLog = createEventLog(storageContext);
  const planner = createPlanner();

  const { manifest, hash: manifestHash } = await loadOrCreateManifest(manifestService, movieId);
  let targetRevision = nextRevisionId(manifest.revision ?? null);
  targetRevision = await ensureUniquePlanRevision(storageContext, movieId, targetRevision);

  const blueprintPath = options.usingBlueprint
    ? expandPath(options.usingBlueprint)
    : DEFAULT_BLUEPRINT_PATH;
  const { blueprint: resolvedBlueprint } = await loadBlueprintFromToml(blueprintPath);

  const inputValues = await loadInputsFromToml(options.inputsPath, resolvedBlueprint);
  if (typeof inputValues.InquiryPrompt !== 'string' || inputValues.InquiryPrompt.trim().length === 0) {
    throw new Error('Input TOML must specify inputs.InquiryPrompt as a non-empty string.');
  }
  await persistInputs(movieDir, options.inputsPath, inputValues);
  const pendingEvents = createInputEvents(inputValues, targetRevision);
  const resolvedInputs = buildResolvedInputMap(pendingEvents);
  console.debug('[planner] resolved inputs', Object.keys(resolvedInputs));
  const expansionConfig = deriveExpansionConfig(inputValues);

  for (const event of pendingEvents) {
    await eventLog.appendInput(movieId, event);
  }

  const providerOptions = buildProducerOptionsFromBlueprint(resolvedBlueprint);
  const catalog = buildProducerCatalog(providerOptions);
  const graphData: BlueprintGraphData = {
    nodes: resolvedBlueprint.nodes,
    edges: resolvedBlueprint.edges as BlueprintEdge[],
  };
  const expanded = expandBlueprint(expansionConfig, graphData);
  const producerGraph = createProducerGraph(expanded, catalog);
  console.log(`Using blueprint: ${blueprintPath}`);

  const plan = await planner.computePlan({
    movieId,
    manifest,
    eventLog,
    blueprint: producerGraph,
    targetRevision,
    pendingEdits: pendingEvents,
  });

  await planStore.save(plan, { movieId, storage: storageContext });

  const planPath = resolve(movieDir, 'runs', `${targetRevision}-plan.json`);
  return {
    planPath,
    targetRevision,
    inputEvents: pendingEvents,
    manifest,
    plan,
    manifestHash,
    resolvedInputs,
    providerOptions,
  };
}

async function loadOrCreateManifest(
  service: ReturnType<typeof createManifestService>,
  movieId: string,
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
          createdAt: new Date().toISOString(),
          inputs: {},
          artefacts: {},
          timeline: {},
        } satisfies Manifest,
        hash: null,
      };
    }
    throw error;
  }
}

function createInputEvents(
  inputValues: InputMap,
  revision: RevisionId,
): InputEvent[] {
  const now = new Date().toISOString();
  const entries: InputEvent[] = [];
  for (const [id, payload] of Object.entries(inputValues)) {
    if (payload === undefined) {
      continue;
    }
    entries.push(makeInputEvent(id, payload, revision, now));
  }
  return entries;
}

function buildResolvedInputMap(events: InputEvent[]): Record<string, unknown> {
  const resolved = new Map<string, unknown>();
  for (const event of events) {
    resolved.set(event.id, event.payload);
  }
  return Object.fromEntries(resolved.entries());
}

function makeInputEvent(id: string, payload: unknown, revision: RevisionId, createdAt: string): InputEvent {
  const { hash } = hashPayload(payload);
  return {
    id,
    revision,
    payload,
    hash,
    editedBy: 'user',
    createdAt,
  };
}

async function ensureUniquePlanRevision(
  storageContext: StorageContext,
  movieId: string,
  initial: RevisionId,
): Promise<RevisionId> {
  let candidate = initial;
  while (await planExists(storageContext, movieId, candidate)) {
    candidate = nextRevisionId(candidate);
  }
  return candidate;
}

async function planExists(
  storageContext: StorageContext,
  movieId: string,
  revision: RevisionId,
): Promise<boolean> {
  const planPath = storageContext.resolve(movieId, 'runs', `${revision}-plan.json`);
  return storageContext.storage.fileExists(planPath);
}

async function persistInputs(movieDir: string, inputsPath: string, values: InputMap): Promise<void> {
  const contents = await readFile(inputsPath, 'utf8');
  await writeFile(join(movieDir, 'inputs.toml'), contents, 'utf8');
  const promptValue = values.InquiryPrompt;
  if (typeof promptValue === 'string' && promptValue.trim().length > 0) {
    await writePromptFile(movieDir, join('prompts', 'inquiry.txt'), promptValue);
  }
}
