import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expandPath } from './path.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BLUEPRINTS_ROOT = resolve(__dirname, '../../blueprints');

export function getBundledBlueprintsRoot(): string {
  return BLUEPRINTS_ROOT;
}

export async function copyBundledBlueprints(targetRoot: string): Promise<void> {
  await copyDirectory(BLUEPRINTS_ROOT, targetRoot);
}

export interface ResolveBlueprintOptions {
  cliRoot?: string;
}

export async function resolveBlueprintSpecifier(
  specifier: string,
  options: ResolveBlueprintOptions = {},
): Promise<string> {
  if (!specifier || specifier.trim().length === 0) {
    throw new Error('Blueprint path cannot be empty.');
  }

  const attempts: string[] = [];

  const expanded = expandPath(specifier);
  attempts.push(expanded);
  if (await fileExists(expanded)) {
    return expanded;
  }

  if (options.cliRoot) {
    const cliBlueprintPath = resolve(options.cliRoot, 'blueprints', specifier);
    attempts.push(cliBlueprintPath);
    if (await fileExists(cliBlueprintPath)) {
      return cliBlueprintPath;
    }
  }

  const bundledPath = resolve(BLUEPRINTS_ROOT, specifier);
  attempts.push(bundledPath);
  if (await fileExists(bundledPath)) {
    return bundledPath;
  }

  throw new Error(
    `Blueprint "${specifier}" not found. Checked: ${attempts
      .map((entry) => `"${entry}"`)
      .join(', ')}`,
  );
}

async function copyDirectory(source: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(source, entry.name);
    const targetPath = join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (await fileExists(targetPath)) {
      continue;
    }
    await copyFile(sourcePath, targetPath);
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
