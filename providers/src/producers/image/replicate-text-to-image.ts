import type { HandlerFactory } from '../../types.js';
import { createSchemaFirstReplicateHandler } from '../../sdk/replicate/schema-first-handler.js';

const OUTPUT_MIME_TYPE = 'image/png';

export function createReplicateTextToImageHandler(): HandlerFactory {
  return createSchemaFirstReplicateHandler({
    outputMimeType: OUTPUT_MIME_TYPE,
    logKey: 'image',
    missingSchemaMessage: 'Missing input schema for Replicate image provider.',
    predictionFailedMessage: 'Replicate prediction failed',
    includeErrorMessage: true,
  });
}
