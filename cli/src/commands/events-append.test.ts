import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  createEventLog,
  createStorageContext,
  hashArtefactOutput,
  hashInputPayload,
  hashInputs,
  type ArtefactEvent,
  type InputEvent,
} from 'tutopanda-core';
import { runEventsAppend } from './events-append.js';
import { runStorageInit } from './storage-init.js';

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
  const dir = await mkdtemp(join(tmpdir(), 'tutopanda-cli-'));
  tmpRoots.push(dir);
  return dir;
}

describe('runEventsAppend', () => {
  it('appends input events to the log', async () => {
    const root = await createTempRoot();
    await runStorageInit({ movieId: 'demo', rootDir: root, basePath: 'builds' });

    const inputEvent: InputEvent = {
      id: 'inquiry_prompt',
      revision: 'rev-0001',
      payload: { prompt: 'hello world' },
      hash: hashInputPayload({ prompt: 'hello world' }),
      editedBy: 'user',
      createdAt: new Date().toISOString(),
    };
    const eventFile = join(root, 'input-event.json');
    await writeFile(eventFile, JSON.stringify(inputEvent), 'utf8');

    await runEventsAppend({
      movieId: 'demo',
      type: 'input',
      file: eventFile,
      rootDir: root,
      basePath: 'builds',
    });

    const ctx = createStorageContext({ kind: 'local', rootDir: root, basePath: 'builds' });
    const eventLog = createEventLog(ctx);

    const collected: InputEvent[] = [];
    for await (const evt of eventLog.streamInputs('demo')) {
      collected.push(evt);
    }

    expect(collected).toEqual([inputEvent]);
  });

  it('appends artefact events to the log', async () => {
    const root = await createTempRoot();
    await runStorageInit({ movieId: 'demo', rootDir: root, basePath: 'builds' });

    const artefactEvent: ArtefactEvent = {
      artefactId: 'segment_script_0',
      revision: 'rev-0002',
      inputsHash: hashInputs(['input:narration', 'input:style']),
      output: {
        blob: {
          hash: hashArtefactOutput({ inline: 'story' }),
          size: 24,
          mimeType: 'text/plain',
        },
      },
      status: 'succeeded',
      producedBy: 'script_producer',
      createdAt: new Date().toISOString(),
      diagnostics: { latencyMs: 987 },
    };
    const eventFile = join(root, 'artefact-event.json');
    await writeFile(eventFile, JSON.stringify(artefactEvent), 'utf8');

    await runEventsAppend({
      movieId: 'demo',
      type: 'artifact',
      file: eventFile,
      rootDir: root,
      basePath: 'builds',
    });

    const ctx = createStorageContext({ kind: 'local', rootDir: root, basePath: 'builds' });
    const eventLog = createEventLog(ctx);

    const collected: ArtefactEvent[] = [];
    for await (const evt of eventLog.streamArtefacts('demo')) {
      collected.push(evt);
    }

    expect(collected).toEqual([artefactEvent]);
  });
});
