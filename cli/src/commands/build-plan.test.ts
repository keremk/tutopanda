import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runBuildPlan } from './build-plan.js';

const tmpRoots: string[] = [];

afterEach(async () => {
  while (tmpRoots.length) {
    const dir = tmpRoots.pop();
    if (dir) {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

async function createTempRoot(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'tutopanda-plan-'));
  tmpRoots.push(dir);
  return dir;
}

describe('runBuildPlan', () => {
  it('generates and saves an execution plan', async () => {
    const root = await createTempRoot();
    const configPath = join(root, 'config.json');

    const config = {
      storage: {
        basePath: 'builds',
      },
      blueprint: {
        segmentCount: 2,
        imagesPerSegment: 1,
        useVideo: false,
        isImageToVideo: false,
      },
      inputs: {
        InquiryPrompt: 'Tell me a story about the sea',
        UseVideo: false,
        IsImageToVideo: false,
        Duration: 60,
        ImagesPerSegment: 1,
      },
    };

    await writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

    const result = await runBuildPlan({
      movieId: 'demo',
      configPath,
      prompt: 'An epic voyage',
      rootDir: root,
      basePath: 'builds',
    });

    expect(result.plan.layers.length).toBeGreaterThan(0);

    const storedPlan = JSON.parse(
      await readFile(join(root, 'builds/demo/runs', `${result.targetRevision}-plan.json`), 'utf8'),
    );
    expect(Array.isArray(storedPlan.layers)).toBe(true);
    expect(storedPlan.layers.length).toBeGreaterThan(0);

    const inputsLog = await readFile(join(root, 'builds/demo/events/inputs.log'), 'utf8');
    expect(inputsLog.trim().length).toBeGreaterThan(0);
  });
});
