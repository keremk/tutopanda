import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { CliConfig } from './cli-config.js';
import { getCliConfigRoot } from './config-assets.js';

export interface ViewerServerState {
  pid: number;
  port: number;
  host: string;
  startedAt: string;
}

export function getViewerStatePath(config: CliConfig): string {
  const configRoot = getCliConfigRoot(config.storage.root);
  return join(configRoot, 'viewer-server.json');
}

export async function readViewerState(path: string): Promise<ViewerServerState | null> {
  try {
    const contents = await readFile(path, 'utf8');
    const parsed = JSON.parse(contents) as ViewerServerState;
    if (typeof parsed.pid !== 'number' || typeof parsed.port !== 'number' || typeof parsed.host !== 'string') {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function writeViewerState(path: string, state: ViewerServerState): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), 'utf8');
}

export async function removeViewerState(path: string): Promise<void> {
  try {
    await rm(path);
  } catch {
    // ignore
  }
}
