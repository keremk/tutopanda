import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { loadBlueprintBundle } from './loader.js';
import { getBundledBlueprintsRoot } from '../config-assets.js';

describe('loadBlueprintBundle', () => {
  it('loads root and nested sub-blueprints', async () => {
    const bundlePath = resolve(getBundledBlueprintsRoot(), 'image-only.yaml');
    const bundle = await loadBlueprintBundle(bundlePath);
    expect(bundle.root.id).toBe('ImageOnly');
    expect(bundle.root.children.size).toBe(3);
    const script = bundle.root.children.get('ScriptGenerator');
    expect(script?.document.meta.id).toBe('ScriptGenerator');
    expect(script?.children.size).toBe(0);
  });
});
