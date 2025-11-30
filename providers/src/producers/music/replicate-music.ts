import type { HandlerFactory } from '../../types.js';
import { createSchemaFirstReplicateHandler } from '../../sdk/replicate/schema-first-handler.js';

const OUTPUT_MIME_TYPE = 'audio/mpeg';

export function createReplicateMusicHandler(): HandlerFactory {
  return createSchemaFirstReplicateHandler({
    outputMimeType: OUTPUT_MIME_TYPE,
    logKey: 'music',
    missingSchemaMessage: 'Missing input schema for Replicate music provider.',
    predictionFailedMessage: 'Replicate music prediction failed.',
  });
}
