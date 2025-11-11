import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBlueprintDocument } from './toml-parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function readFixture(name: string): string {
  return readFileSync(resolve(__dirname, '../../../blueprints', name), 'utf8');
}

describe('parseBlueprintDocument', () => {
  it('parses root blueprint metadata and sections', () => {
    const blueprint = parseBlueprintDocument(readFixture('image-only.toml'));
    expect(blueprint.meta.id).toBe('ImageOnly');
    expect(blueprint.inputs).toHaveLength(8);
    expect(blueprint.artefacts).toHaveLength(1);
    expect(blueprint.edges).toHaveLength(14);
    expect(blueprint.subBlueprints.map((entry) => entry.name)).toEqual([
      'ScriptGenerator',
      'ImagePromptGenerator',
      'ImageGenerator',
    ]);
  });

  it('parses producer config with sdkMapping and outputs', () => {
    const blueprint = parseBlueprintDocument(readFixture('image-generate.toml'));
    expect(blueprint.producers).toHaveLength(1);
    const [producer] = blueprint.producers;

    expect(producer.name).toBe('TextToImageProducer');
    expect(producer.provider).toBe('replicate');
    expect(producer.model).toBe('bytedance/seedream-4');
    expect(producer.sdkMapping).toEqual({
      Prompt: { field: 'prompt', type: 'string', required: true },
      AspectRatio: { field: 'aspect_ratio', type: 'string', required: false },
      Size: { field: 'output_size', type: 'string', required: false },
    });
    expect(producer.outputs).toEqual({
      SegmentImage: { type: 'image', mimeType: 'image/png' },
    });
    expect(producer.config).toEqual({
      sequential_image_generation: 'disabled',
      max_images: 1,
      enhance_prompt: true,
    });
  });

  it('enforces defaults for optional inputs', () => {
    const blueprint = parseBlueprintDocument(readFixture('script-generate.toml'));
    const language = blueprint.inputs.find((entry) => entry.name === 'Language');
    expect(language?.defaultValue).toBe('en');
    expect(language?.required).toBe(false);
  });

  it('throws when [[artifacts]] section is missing', () => {
    const invalid = `
      [meta]
      id = "Broken"
      name = "Broken"

      [[inputs]]
      name = "Prompt"
      type = "string"
      required = true

      [graph]
      edges = []
    `;
    expect(() => parseBlueprintDocument(invalid)).toThrow('[[artifacts]]');
  });
});
