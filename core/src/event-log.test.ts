import { describe, expect, it } from 'vitest';
import {
  createEventLog,
  hashArtefactOutput,
  hashInputPayload,
  hashInputs,
} from './event-log.js';
import { createStorageContext, initializeMovieStorage } from './storage.js';
import type { ArtefactEvent, InputEvent } from './types.js';

function memoryContext() {
  return createStorageContext({ kind: 'memory', basePath: 'builds' });
}

describe('EventLog', () => {
  it('appends and streams input events', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const eventLog = createEventLog(ctx);

    const payload = { prompt: 'tell me a story', temperature: 0.8 };
    const inputEvent: InputEvent = {
      id: 'inquiry_prompt',
      revision: 'rev-0001',
      hash: hashInputPayload(payload),
      payload,
      editedBy: 'user',
      createdAt: new Date().toISOString(),
    };

    await eventLog.appendInput('demo', inputEvent);

    const collected: InputEvent[] = [];
    for await (const evt of eventLog.streamInputs('demo')) {
      collected.push(evt);
    }

    expect(collected).toHaveLength(1);
    expect(collected[0]).toEqual(inputEvent);
  });

  it('supports tailing inputs after a given revision', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const eventLog = createEventLog(ctx);

    const eventFactory = (revision: 'rev-0001' | 'rev-0002' | 'rev-0003'): InputEvent => ({
      id: `input-${revision}`,
      revision,
      hash: hashInputPayload({ revision }),
      payload: { revision },
      editedBy: 'system',
      createdAt: new Date(Date.now() + Number(revision.slice(-1))).toISOString(),
    });

    await eventLog.appendInput('demo', eventFactory('rev-0001'));
    await eventLog.appendInput('demo', eventFactory('rev-0002'));
    await eventLog.appendInput('demo', eventFactory('rev-0003'));

    const collected: InputEvent[] = [];
    for await (const evt of eventLog.streamInputs('demo', 'rev-0002')) {
      collected.push(evt);
    }

    expect(collected).toHaveLength(1);
    expect(collected[0].revision).toBe('rev-0003');
  });

  it('appends artefact events and streams them back', async () => {
    const ctx = memoryContext();
    await initializeMovieStorage(ctx, 'demo');
    const eventLog = createEventLog(ctx);

    const artefactEvent: ArtefactEvent = {
      artefactId: 'segment_script_0',
      revision: 'rev-0002',
      inputsHash: hashInputs(['input:script_prompt', 'input:audience']),
      output: {
        blob: {
          hash: hashArtefactOutput({ inline: 'narration content' }),
          size: 48,
          mimeType: 'text/plain',
        },
      },
      status: 'succeeded',
      producedBy: 'script_producer',
      diagnostics: { latencyMs: 1200 },
      createdAt: new Date().toISOString(),
    };

    await eventLog.appendArtefact('demo', artefactEvent);

    const collected: ArtefactEvent[] = [];
    for await (const evt of eventLog.streamArtefacts('demo')) {
      collected.push(evt);
    }

    expect(collected).toHaveLength(1);
    expect(collected[0]).toEqual(artefactEvent);
  });

  it('produces stable hashes for equivalent payloads', () => {
    const first = hashInputPayload({ a: 1, b: { c: 2 } });
    const second = hashInputPayload({ b: { c: 2 }, a: 1 });
    expect(first).toBe(second);

    const outputHash = hashArtefactOutput({
      inline: 'hello',
      blob: { hash: 'sha', size: 1, mimeType: 'text/plain' },
    });
    const outputHashPermuted = hashArtefactOutput({
      blob: { mimeType: 'text/plain', size: 1, hash: 'sha' },
      inline: 'hello',
    });
    expect(outputHash).toBe(outputHashPermuted);
  });
});
