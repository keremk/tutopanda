import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FileStorage } from '@flystorage/file-storage';
import { LocalStorageAdapter } from '@flystorage/local-fs';
import {
  createFlyStorageBlueprintReader,
  loadYamlBlueprintTree,
  parseYamlBlueprintFile,
} from './yaml-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');
const yamlRoot = resolve(repoRoot, 'cli/blueprints/yaml');

describe('parseYamlBlueprintFile', () => {
  it('parses module producers and loads prompt/schema files', async () => {
    const modulePath = resolve(yamlRoot, 'modules/script-generator.yaml');
    const document = await parseYamlBlueprintFile(modulePath);
    expect(document.meta.id).toBe('ScriptGenerator');
    expect(document.producers).toHaveLength(1);
    const producer = document.producers[0];
    expect(producer.model).toBe('gpt-5-mini');
    expect(producer.systemPrompt).toContain('expert historical researcher');
    expect(producer.jsonSchema).toContain('MovieTitle');
    expect(producer.variables).toEqual([
      'Audience',
      'Duration',
      'NumOfSegments',
      'Language',
      'InquiryPrompt',
    ]);
  });

  it('normalizes collector references into canonical edge notation', async () => {
    const blueprintPath = resolve(yamlRoot, 'image-only.yaml');
    const document = await parseYamlBlueprintFile(blueprintPath);
    expect(document.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: 'ImageGenerator[segment][image].SegmentImage',
          to: 'SegmentImage[segment][image]',
        }),
      ]),
    );
    expect(document.subBlueprints.map((entry) => entry.name)).toEqual([
      'ScriptGenerator',
      'ImagePromptGenerator',
      'ImageGenerator',
    ]);
  });
});

describe('loadYamlBlueprintTree', () => {
  it('loads entire blueprint hierarchy using FlyStorage reader', async () => {
    const storage = new FileStorage(new LocalStorageAdapter(repoRoot));
    const reader = createFlyStorageBlueprintReader(storage, repoRoot);
    const entry = resolve(yamlRoot, 'audio-only.yaml');
    const { root } = await loadYamlBlueprintTree(entry, { reader });
    expect(root.id).toBe('audio');
    expect([...root.children.keys()]).toEqual(['ScriptGenerator', 'AudioGenerator']);
    const scriptNode = root.children.get('ScriptGenerator');
    expect(scriptNode?.document.producers[0]?.model).toBe('gpt-5-mini');
  });
});
