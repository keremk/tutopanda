import { mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { stringify as stringifyYaml } from 'yaml';
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
  type Logger,
} from '@tutopanda/core';
export type { PendingArtefactDraft } from '@tutopanda/core';
import type { CliConfig } from './cli-config.js';
import { writePromptFile } from './prompts.js';
import { loadBlueprintBundle } from './blueprint-loader/index.js';
import { loadInputsFromYaml, type InputMap } from './input-loader.js';
import {
  buildProducerOptionsFromBlueprint,
  buildProducerCatalog,
  type ProducerOptionsMap,
} from './producer-options.js';
import { expandPath } from './path.js';
import { mergeMovieMetadata } from './movie-metadata.js';
import { INPUT_FILE_NAME } from './input-files.js';

const planningService = createPlanningService();

export interface GeneratePlanOptions {
  cliConfig: CliConfig;
  movieId: string; // storage movie id (e.g., movie-q123)
  isNew: boolean;
  inputsPath: string;
  usingBlueprint: string; // Path to blueprint YAML file
  inquiryPromptOverride?: string;
  pendingArtefacts?: PendingArtefactDraft[];
  logger?: Logger;
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
  const logger = options.logger ?? globalThis.console;
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

  const blueprintPath = expandPath(options.usingBlueprint);
  const { root: blueprintRoot } = await loadBlueprintBundle(blueprintPath);
  await mergeMovieMetadata(movieDir, { blueprintPath });

  const inputValues = await loadInputsFromYaml(options.inputsPath, blueprintRoot, options.inquiryPromptOverride);
  if (typeof inputValues.InquiryPrompt !== 'string' || inputValues.InquiryPrompt.trim().length === 0) {
    throw new Error('Input YAML must specify inputs.InquiryPrompt as a non-empty string.');
  }
  await persistInputs(movieDir, inputValues);

  const providerOptions = buildProducerOptionsFromBlueprint(blueprintRoot);
  const catalog = buildProducerCatalog(providerOptions);
  logger.info(`Using blueprint: ${blueprintPath}`);

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
  logger.debug('[planner] resolved inputs', { inputs: Object.keys(planResult.resolvedInputs) });

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

async function persistInputs(movieDir: string, values: InputMap): Promise<void> {
  const contents = stringifyYaml({ inputs: values });
  await writeFile(join(movieDir, INPUT_FILE_NAME), contents, 'utf8');
  const promptValue = values.InquiryPrompt;
  if (typeof promptValue === 'string' && promptValue.trim().length > 0) {
    await writePromptFile(movieDir, join('prompts', 'inquiry.txt'), promptValue);
  }
}
