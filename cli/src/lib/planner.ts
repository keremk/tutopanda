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
} from 'tutopanda-core';
import type { CliConfig } from './cli-config.js';
import type { ProjectConfig } from 'tutopanda-core';
import { deriveBlueprintAndInputs } from './project-config.js';
import { writePromptFile } from './prompts.js';

export interface GeneratePlanOptions {
  cliConfig: CliConfig;
  projectConfig: ProjectConfig;
  prompt: string;
  movieId: string; // storage movie id (e.g., movie-q123)
  isNew: boolean;
}

export interface GeneratePlanResult {
  planPath: string;
  targetRevision: string;
  inputEvents: InputEvent[];
}

export async function generatePlan(options: GeneratePlanOptions): Promise<GeneratePlanResult> {
  const { cliConfig, projectConfig, prompt, movieId } = options;
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
  await writePromptFile(movieDir, join('prompts', 'inquiry.txt'), prompt);

  const manifestService = createManifestService(storageContext);
  const eventLog = createEventLog(storageContext);
  const planner = createPlanner();

  const manifest = await loadOrCreateManifest(manifestService, movieId);
  const targetRevision = nextRevisionId(manifest.revision ?? null);

  const { blueprint, inputValues } = deriveBlueprintAndInputs(projectConfig);
  const pendingEvents = createInputEvents(prompt, inputValues, targetRevision);

  for (const event of pendingEvents) {
    await eventLog.appendInput(movieId, event);
  }

  const plan = await planner.computePlan({
    movieId,
    manifest,
    eventLog,
    blueprint: createProducerGraphFromConfig(blueprint),
    targetRevision,
    pendingEdits: pendingEvents,
  });

  await planStore.save(plan, { movieId, storage: storageContext });

  const planPath = resolve(movieDir, 'runs', `${targetRevision}-plan.json`);
  return { planPath, targetRevision, inputEvents: pendingEvents };
}

async function loadOrCreateManifest(
  service: ReturnType<typeof createManifestService>,
  movieId: string,
): Promise<Manifest> {
  try {
    const { manifest } = await service.loadCurrent(movieId);
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
      } satisfies Manifest;
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
