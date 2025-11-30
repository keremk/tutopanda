import type { HandlerFactory } from '../../types.js';
import { createSchemaFirstReplicateHandler } from '../../sdk/replicate/schema-first-handler.js';

const OUTPUT_MIME_TYPE = 'video/mp4';

export function createReplicateVideoHandler(): HandlerFactory {
  return createSchemaFirstReplicateHandler({
    outputMimeType: OUTPUT_MIME_TYPE,
    logKey: 'video',
    missingSchemaMessage: 'Missing input schema for Replicate video provider.',
    predictionFailedMessage: 'Replicate video prediction failed.',
  });
}
