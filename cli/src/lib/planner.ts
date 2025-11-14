/* eslint-disable no-console */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createStorageContext,
  initializeMovieStorage,
  createManifestService,
  createEventLog,
  createPlanningService,
  type InputEvent,
  type Manifest,
  type ExecutionPlan,
  type PendingArtefactDraft,
} from 'tutopanda-core';
export type { PendingArtefactDraft } from 'tutopanda-core';
import type { CliConfig } from './cli-config.js';
import { writePromptFile } from './prompts.js';
import { loadBlueprintBundle } from './blueprint-loader/index.js';
import { loadInputsFromToml, type InputMap } from './input-loader.js';
import {
  buildProducerOptionsFromBlueprint,
  buildProducerCatalog,
  type ProducerOptionsMap,
} from './producer-options.js';
import { expandPath } from './path.js';
import { mergeMovieMetadata } from './movie-metadata.js';

const console = globalThis.console;
const planningService = createPlanningService();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_BLUEPRINT_PATH = resolve(__dirname, '../../blueprints/yaml/audio-only.yaml');

export interface GeneratePlanOptions {
  cliConfig: CliConfig;
  movieId: string; // storage movie id (e.g., movie-q123)
  isNew: boolean;
  inputsPath: string;
  usingBlueprint?: string; // Path to blueprint TOML file
  pendingArtefacts?: PendingArtefactDraft[];
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
  blueprintPath: string;
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

  const blueprintPath = options.usingBlueprint
    ? expandPath(options.usingBlueprint)
    : DEFAULT_BLUEPRINT_PATH;
  const { root: blueprintRoot } = await loadBlueprintBundle(blueprintPath);
  await mergeMovieMetadata(movieDir, { blueprintPath });

  const inputValues = await loadInputsFromToml(options.inputsPath, blueprintRoot);
  if (typeof inputValues.InquiryPrompt !== 'string' || inputValues.InquiryPrompt.trim().length === 0) {
    throw new Error('Input TOML must specify inputs.InquiryPrompt as a non-empty string.');
  }
  await persistInputs(movieDir, options.inputsPath, inputValues);

  const providerOptions = buildProducerOptionsFromBlueprint(blueprintRoot);
  const catalog = buildProducerCatalog(providerOptions);
  console.log(`Using blueprint: ${blueprintPath}`);

  const planResult = await planningService.generatePlan({
    movieId,
    blueprintTree: blueprintRoot,
    inputValues,
    providerCatalog: catalog,
    storage: storageContext,
    manifestService,
    eventLog,
    pendingArtefacts: options.pendingArtefacts,
  });
  console.debug('[planner] resolved inputs', Object.keys(planResult.resolvedInputs));

  return {
    planPath: planResult.planPath,
    targetRevision: planResult.targetRevision,
    inputEvents: planResult.inputEvents,
    manifest: planResult.manifest,
    plan: planResult.plan,
    manifestHash: planResult.manifestHash,
    resolvedInputs: planResult.resolvedInputs,
    providerOptions,
    blueprintPath,
  };
}

async function persistInputs(movieDir: string, inputsPath: string, values: InputMap): Promise<void> {
  const contents = await readFile(inputsPath, 'utf8');
  await writeFile(join(movieDir, 'inputs.toml'), contents, 'utf8');
  const promptValue = values.InquiryPrompt;
  if (typeof promptValue === 'string' && promptValue.trim().length > 0) {
    await writePromptFile(movieDir, join('prompts', 'inquiry.txt'), promptValue);
  }
}
