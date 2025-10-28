import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import {
  createEventLog,
  createStorageContext,
  type ArtefactEvent,
  type InputEvent,
} from 'tutopanda-core';

export type EventAppendKind = 'input' | 'artifact';

export interface EventsAppendOptions {
  movieId: string;
  type: EventAppendKind;
  file: string;
  rootDir?: string;
  basePath?: string;
}

export async function runEventsAppend(
  options: EventsAppendOptions,
): Promise<{ rootPath: string; eventPath: string }> {
  const rootPath = resolve(options.rootDir ?? process.cwd());
  const eventPath = resolve(options.file);

  const storageContext = createStorageContext({
    kind: 'local',
    rootDir: rootPath,
    basePath: options.basePath,
  });
  const eventLog = createEventLog(storageContext);

  const raw = await readFile(eventPath, 'utf8');
  const parsed = JSON.parse(raw) as InputEvent | ArtefactEvent;

  if (options.type === 'input') {
    await eventLog.appendInput(options.movieId, parsed as InputEvent);
  } else if (options.type === 'artifact') {
    await eventLog.appendArtefact(options.movieId, parsed as ArtefactEvent);
  } else {
    throw new Error(`Unsupported event type: ${options.type}`);
  }

  return { rootPath, eventPath };
}
