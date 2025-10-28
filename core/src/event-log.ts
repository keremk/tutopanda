import { createHash } from 'node:crypto';
import type { StorageContext } from './storage.js';
import type {
  ArtefactEvent,
  ArtefactEventOutput,
  InputEvent,
  RevisionId,
} from './types.js';

export interface EventLog {
  streamInputs(movieId: string, sinceRevision?: RevisionId): AsyncIterable<InputEvent>;
  streamArtefacts(movieId: string, sinceRevision?: RevisionId): AsyncIterable<ArtefactEvent>;
  appendInput(movieId: string, event: InputEvent): Promise<void>;
  appendArtefact(movieId: string, event: ArtefactEvent): Promise<void>;
}

const JSONL_MIME = 'application/jsonl';
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function createEventLog(storage: StorageContext): EventLog {
  return {
    streamInputs(movieId, sinceRevision) {
      const path = storage.resolve(movieId, 'events', 'inputs.log');
      return iterateEvents<InputEvent>(storage, path, sinceRevision);
    },
    streamArtefacts(movieId, sinceRevision) {
      const path = storage.resolve(movieId, 'events', 'artefacts.log');
      return iterateEvents<ArtefactEvent>(storage, path, sinceRevision);
    },
    async appendInput(movieId, event) {
      const path = storage.resolve(movieId, 'events', 'inputs.log');
      await appendEvent(storage, path, event);
    },
    async appendArtefact(movieId, event) {
      const path = storage.resolve(movieId, 'events', 'artefacts.log');
      await appendEvent(storage, path, event);
    },
  };
}

export function hashInputPayload(payload: unknown): string {
  return stableHash(payload);
}

export function hashArtefactOutput(output: ArtefactEventOutput): string {
  return stableHash(output);
}

export function hashInputs(inputs: readonly string[]): string {
  return stableHash([...inputs].sort());
}

async function* iterateEvents<T extends { revision: RevisionId }>(
  storage: StorageContext,
  path: string,
  sinceRevision?: RevisionId
): AsyncGenerator<T> {
  if (!(await storage.storage.fileExists(path))) {
    return;
  }
  const raw = await storage.storage.readToString(path);
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const event = JSON.parse(trimmed) as T;
    if (!sinceRevision || isRevisionAfter(event.revision, sinceRevision)) {
      yield event;
    }
  }
}

async function appendEvent(storage: StorageContext, path: string, event: unknown): Promise<void> {
  const serialized = JSON.stringify(event);
  const payload = serialized.endsWith('\n') ? serialized : `${serialized}\n`;

  const exists = await storage.storage.fileExists(path);
  const finalPayload = exists ? await concatenateWithExisting(storage, path, payload) : payload;
  const targetPayload = finalPayload.endsWith('\n') ? finalPayload : `${finalPayload}\n`;

  const tmpPath = `${path}.tmp-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  await storage.storage.write(tmpPath, targetPayload, { mimeType: JSONL_MIME });
  await storage.storage.moveFile(tmpPath, path);
}

async function concatenateWithExisting(storage: StorageContext, path: string, payload: string): Promise<string> {
  const current = await storage.storage.readToString(path);
  if (!current) {
    return payload;
  }
  const normalized = current.endsWith('\n') ? current : `${current}\n`;
  return `${normalized}${payload}`;
}

function isRevisionAfter(candidate: RevisionId, pivot: RevisionId): boolean {
  return collator.compare(candidate, pivot) > 0;
}

function stableHash(value: unknown): string {
  const canonical = canonicalStringify(value);
  return createHash('sha256').update(canonical).digest('hex');
}

function canonicalStringify(value: unknown): string {
  return JSON.stringify(normalizeForSerialization(value));
}

function normalizeForSerialization(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForSerialization(item));
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    entries.sort(([aKey], [bKey]) => aKey.localeCompare(bKey));
    const output: Record<string, unknown> = {};
    for (const [key, val] of entries) {
      output[key] = normalizeForSerialization(val);
    }
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    return value.toString();
  }
  return value;
}
