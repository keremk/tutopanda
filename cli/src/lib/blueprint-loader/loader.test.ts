import { describe, expect, it } from 'vitest';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBlueprintBundle } from './loader.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('loadBlueprintBundle', () => {
  it('loads root and nested sub-blueprints', async () => {
    const bundlePath = resolve(__dirname, '../../../blueprints/image-only.yaml');
    const bundle = await loadBlueprintBundle(bundlePath);
    expect(bundle.root.id).toBe('ImageOnly');
    expect(bundle.root.children.size).toBe(3);
    const script = bundle.root.children.get('ScriptGenerator');
    expect(script?.document.meta.id).toBe('ScriptGenerator');
    expect(script?.children.size).toBe(0);
  });
});
