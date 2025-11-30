import type { HandlerFactory } from '../../types.js';
import { createSchemaFirstReplicateHandler } from '../../sdk/replicate/schema-first-handler.js';

const OUTPUT_MIME_TYPE = 'audio/mpeg';

export function createReplicateAudioHandler(): HandlerFactory {
  return createSchemaFirstReplicateHandler({
    outputMimeType: OUTPUT_MIME_TYPE,
    logKey: 'audio',
    missingSchemaMessage: 'Missing input schema for Replicate audio provider.',
    predictionFailedMessage: 'Replicate prediction failed.',
  });
}

// Retry logic shared across replicate producers lives in sdk/replicate/retry.ts.
