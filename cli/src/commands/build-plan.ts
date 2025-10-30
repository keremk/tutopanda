import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
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
  BuildPlanConfigSchema,
  type ExecutionPlan,
  type InputEvent,
  type InputValues,
  type Manifest,
  type RevisionId,
} from 'tutopanda-core';
import { readCliConfig } from './init-cli.js';

export interface BuildPlanOptions {
  movieId: string;
  configPath: string;
  prompt?: string;
  rootDir?: string;
  basePath?: string;
}

interface BuildPlanResult {
  rootPath: string;
  planPath: string;
  plan: ExecutionPlan;
  targetRevision: string;
}

export async function runBuildPlan(options: BuildPlanOptions): Promise<BuildPlanResult> {
  const config = await loadConfig(options.configPath);
  const cliConfig = await readCliConfig();
  const rootPath = resolve(
    options.rootDir ?? config.storage?.root ?? cliConfig?.storage?.root ?? process.cwd(),
  );
  const basePath =
    options.basePath ?? config.storage?.basePath ?? cliConfig?.storage?.basePath ?? 'builds';
  const storage = createStorageContext({ kind: 'local', rootDir: rootPath, basePath });

  await initializeMovieStorage(storage, options.movieId);

  const eventLog = createEventLog(storage);
  const manifestService = createManifestService(storage);

  const manifest = await loadOrCreateManifest(manifestService, options.movieId);
  const targetRevision = nextRevisionId(manifest.revision ?? null);

  const inputEvents = buildInputEvents(config.inputs, options.prompt, targetRevision);

  for (const event of inputEvents) {
    await eventLog.appendInput(options.movieId, event);
  }

  const planner = createPlanner();
  const blueprint = createProducerGraphFromConfig(config.blueprint);

  const plan = await planner.computePlan({
    movieId: options.movieId,
    manifest,
    eventLog,
    blueprint,
    targetRevision,
    pendingEdits: inputEvents,
  });

  await planStore.save(plan, { movieId: options.movieId, storage });

  const planPath = storage.resolve(options.movieId, 'runs', `${targetRevision}-plan.json`);

  return {
    rootPath,
    planPath,
    plan,
    targetRevision,
  };
}

async function loadConfig(path: string) {
  const resolved = resolve(path);
  const raw = await readFile(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  try {
    return BuildPlanConfigSchema.parse(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid build plan configuration: ${error.message}`);
    }
    throw error;
  }
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
      return createEmptyManifest();
    }
    throw error;
  }
}

function createEmptyManifest(): Manifest {
  const now = new Date().toISOString();
  return {
    revision: 'rev-0000',
    baseRevision: null,
    createdAt: now,
    inputs: {},
    artefacts: {},
    timeline: {},
  };
}

function buildInputEvents(inputs: InputValues, prompt: string | undefined, revision: RevisionId): InputEvent[] {
  const now = new Date().toISOString();
  const merged: InputValues = { ...inputs };
  if (prompt !== undefined) {
    merged.InquiryPrompt = prompt;
  }
  return (Object.entries(merged) as [keyof InputValues, InputValues[keyof InputValues]][])
    .filter(([, value]) => value !== undefined)
    .map(([id, payload]) => {
      const { hash } = hashPayload(payload);
      const event: InputEvent = {
        id: String(id),
        revision,
        payload,
        hash,
        editedBy: 'user',
        createdAt: now,
      };
      return event;
    });
}
