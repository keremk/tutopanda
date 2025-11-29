import { mkdtemp, readFile, writeFile, copyFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { runQuery } from '../../src/commands/query.js';
import { runEdit } from '../../src/commands/edit.js';
import { writeCliConfig, type CliConfig } from '../../src/lib/cli-config.js';
import { getBundledBlueprintsRoot, getBundledConfigRoot } from '../../src/lib/config-assets.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function buildTempConfig(root: string): CliConfig {
  return {
    storage: {
      root,
      basePath: 'builds',
    },
    concurrency: 1,
  };
}

function expectFileExists(path: string): Promise<void> {
  return stat(path).then(() => {});
}

async function readPlan(planPath: string): Promise<any> {
  const contents = await readFile(planPath, 'utf8');
  return JSON.parse(contents);
}

function findJob(plan: any, producer: string) {
  return plan.layers.flat().find((job: any) => job.producer === producer);
}

describe('end-to-end: video-audio-music dry runs', () => {
  const originalConfigEnv = process.env.TUTOPANDA_CLI_CONFIG;
  let tempRoot: string;
  let tempConfigPath: string;

  beforeEach(async () => {
    tempRoot = await mkdtemp(join(tmpdir(), 'tutopanda-e2e-'));
    tempConfigPath = join(tempRoot, 'cli-config.json');
    process.env.TUTOPANDA_CLI_CONFIG = tempConfigPath;
    await writeCliConfig(buildTempConfig(tempRoot), tempConfigPath);
  });

  afterEach(async () => {
    if (originalConfigEnv === undefined) {
      delete process.env.TUTOPANDA_CLI_CONFIG;
    } else {
      process.env.TUTOPANDA_CLI_CONFIG = originalConfigEnv;
    }
  });

  it('runs query and edit dry-runs with canonical bindings and artefacts', async () => {
    const blueprintRoot = getBundledBlueprintsRoot();
    const configRoot = getBundledConfigRoot();
    const blueprintPath = resolve(blueprintRoot, 'video-audio-music.yaml');
    const inputsPath = resolve(configRoot, 'inputs.yaml');
    const warnings: unknown[] = [];
    const errors: unknown[] = [];
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: unknown) => {
        warnings.push(message);
      },
      error: (message: unknown) => {
        errors.push(message);
      },
    };

    // Run query dry-run
    const queryResult = await runQuery({
      inputsPath,
      usingBlueprint: blueprintPath,
      dryRun: true,
      nonInteractive: true,
      logger,
    });

    if (queryResult.dryRun?.status !== 'succeeded') {
      throw new Error(`dryRun failed: ${JSON.stringify(queryResult.dryRun, null, 2)}`);
    }
    expect(queryResult.dryRun?.statusCounts.failed).toBe(0);
    // Debug helpers if warnings/errors appear
    if (warnings.length > 0 || errors.length > 0) {
      // eslint-disable-next-line no-console
      console.error('warnings', warnings, 'errors', errors);
    }
    expect(warnings).toHaveLength(0);
    expect(errors).toHaveLength(0);
    expect(queryResult.planPath).toBeDefined();
    await expectFileExists(queryResult.planPath);
    await expectFileExists(queryResult.storagePath);

    const plan = await readPlan(queryResult.planPath);
    const scriptJob = findJob(plan, 'ScriptProducer');
    expect(scriptJob?.context?.inputBindings?.InquiryPrompt).toBe('Input:InquiryPrompt');
    expect(scriptJob?.context?.inputBindings?.Duration).toBe('Input:Duration');
    expect(scriptJob?.context?.inputBindings?.NumOfSegments).toBe('Input:NumOfSegments');
    expect(scriptJob?.context?.inputBindings?.Language).toBe('Input:Language');
    expect(scriptJob?.context?.inputBindings?.Audience).toBe('Input:Audience');

    const audioJob0 = findJob(plan, 'AudioProducer');
    expect(audioJob0?.context?.inputBindings?.TextInput).toMatch(/^Artifact:ScriptProducer\.NarrationScript\[0]/);
    expect(audioJob0?.inputs.some((id: string) => id.startsWith('Artifact:ScriptProducer.NarrationScript'))).toBe(
      true,
    );

    const videoPromptJob0 = findJob(plan, 'VideoPromptProducer');
    expect(videoPromptJob0?.inputs.some((id: string) => id.startsWith('Artifact:ScriptProducer.NarrationScript'))).toBe(
      true,
    );
    expect(videoPromptJob0?.context?.inputBindings?.NarrativeText).toMatch(
      /^Artifact:ScriptProducer\.NarrationScript\[0]/,
    );

    const musicPromptJob = findJob(plan, 'MusicPromptProducer');
    expect(musicPromptJob?.context?.fanIn?.['Input:MusicPromptProducer.NarrationScript']?.members?.length).toBeGreaterThan(
      0,
    );
    expect(musicPromptJob?.context?.inputBindings?.NarrationScript).toBe('Input:MusicPromptProducer.NarrationScript');

    // Ensure plan artifacts stored under storage root
    await expectFileExists(resolve(queryResult.storagePath, 'runs', `${queryResult.targetRevision}-plan.json`));
    await expectFileExists(resolve(queryResult.storagePath, 'inputs.yaml'));

    // Prepare edited inputs to force re-run
    const editedInputsPath = join(tempRoot, 'edited-inputs.yaml');
    await copyFile(inputsPath, editedInputsPath);
    const edited = await readFile(editedInputsPath, 'utf8');
    await writeFile(
      editedInputsPath,
      edited.replace('Tell me about Darwin and Galapagos islands', 'Describe the solar system'),
      'utf8',
    );

    const editResult = await runEdit({
      movieId: queryResult.storageMovieId,
      inputsPath: editedInputsPath,
      dryRun: true,
      nonInteractive: true,
      usingBlueprint: blueprintPath,
      logger,
    });

    expect(editResult.dryRun?.status).toBe('succeeded');
    expect(editResult.dryRun?.statusCounts.failed).toBe(0);
    expect(warnings).toHaveLength(0);
    expect(errors).toHaveLength(0);
    await expectFileExists(editResult.planPath);
    const editPlan = await readPlan(editResult.planPath);
    const editAudioJob0 = findJob(editPlan, 'AudioProducer');
    expect(editAudioJob0?.context?.inputBindings?.TextInput).toMatch(
      /^Artifact:ScriptProducer\.NarrationScript\[0]/,
    );
  });
});
