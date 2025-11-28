import Ajv, { type ValidateFunction } from 'ajv';
import addFormats from 'ajv-formats';
import { createHash } from 'node:crypto';

type ValidatorCacheKey = string;

interface ValidatorEntry {
  key: ValidatorCacheKey;
  validate: ValidateFunction;
}

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const cache = new Map<ValidatorCacheKey, ValidatorEntry>();

function computeKey(schemaText: string): ValidatorCacheKey {
  return createHash('sha256').update(schemaText).digest('hex');
}

export function validatePayload(schemaText: string | undefined, payload: unknown, label: string): void {
  if (!schemaText) {
    return;
  }
  const key = computeKey(schemaText);
  let entry = cache.get(key);
  if (!entry) {
    const schema = JSON.parse(schemaText);
    let validate: ValidateFunction;
    try {
      validate = ajv.compile(schema);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Invalid ${label} schema: ${message}`);
    }
    entry = { key, validate };
    cache.set(key, entry);
  }
  const valid = entry.validate(payload);
  if (!valid) {
    const messages = (entry.validate.errors ?? []).map((err) => `${err.instancePath || '/'} ${err.message ?? ''}`.trim());
    throw new Error(`Invalid ${label} payload: ${messages.join('; ')}`);
  }
}
