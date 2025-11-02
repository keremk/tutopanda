import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import {
  createStorageContext,
  initializeMovieStorage,
  createManifestService,
  ManifestNotFoundError,
  createEventLog,
  createProducerGraphFromConfig,
  createPlanner,
  planStore,
  hashPayload,
  nextRevisionId,
  type InputEvent,
  type InputValues,
  type Manifest,
  type RevisionId,
  type ExecutionPlan,
  type StorageContext,
} from 'tutopanda-core';
import type { CliConfig } from './cli-config.js';
import type { ProjectConfig } from 'tutopanda-core';
import { deriveBlueprintAndInputs } from './project-config.js';
import {
  buildProducerCatalog,
  providerOptionsToJSON,
  type ProviderOptionsMap,
} from './provider-settings.js';
import { writePromptFile } from './prompts.js';

export interface GeneratePlanOptions {
  cliConfig: CliConfig;
  projectConfig: ProjectConfig;
  providerOptions: ProviderOptionsMap;
  prompt: string;
  movieId: string; // storage movie id (e.g., movie-q123)
  isNew: boolean;
}

export interface GeneratePlanResult {
  planPath: string;
  targetRevision: string;
  inputEvents: InputEvent[];
  manifest: Manifest;
  plan: ExecutionPlan;
  manifestHash: string | null;
}

export async function generatePlan(options: GeneratePlanOptions): Promise<GeneratePlanResult> {
  const { cliConfig, projectConfig, providerOptions, prompt, movieId } = options;
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

  await writeFile(join(movieDir, 'config.json'), JSON.stringify(projectConfig, null, 2), 'utf8');
  await writeFile(
    join(movieDir, 'providers.json'),
    JSON.stringify(providerOptionsToJSON(providerOptions), null, 2),
    'utf8',
  );
  await writePromptFile(movieDir, join('prompts', 'inquiry.txt'), prompt);

  const manifestService = createManifestService(storageContext);
  const eventLog = createEventLog(storageContext);
  const planner = createPlanner();

  const { manifest, hash: manifestHash } = await loadOrCreateManifest(manifestService, movieId);
  let targetRevision = nextRevisionId(manifest.revision ?? null);
  targetRevision = await ensureUniquePlanRevision(storageContext, movieId, targetRevision);

  const { blueprint, inputValues } = deriveBlueprintAndInputs(projectConfig);
  const pendingEvents = createInputEvents(prompt, inputValues, targetRevision);

  for (const event of pendingEvents) {
    await eventLog.appendInput(movieId, event);
  }

  const catalog = buildProducerCatalog(providerOptions);

  const plan = await planner.computePlan({
    movieId,
    manifest,
    eventLog,
    blueprint: createProducerGraphFromConfig(blueprint, catalog),
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
  prompt: string,
  inputValues: InputValues,
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
  entries.push(makeInputEvent('InquiryPrompt', prompt, revision, now));
  return entries;
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
