import { createOpenAI } from '@ai-sdk/openai';
import type { SecretResolver, ProviderLogger } from '../../types.js';

export interface OpenAiClientManager {
  ensure(): Promise<ReturnType<typeof createOpenAI>>;
  getModel(modelName: string): ReturnType<ReturnType<typeof createOpenAI>>;
}

/**
 * Creates an OpenAI client manager with lazy initialization.
 * Follows the same pattern as Replicate client manager.
 */
export function createOpenAiClientManager(
  secretResolver: SecretResolver,
  logger?: ProviderLogger,
): OpenAiClientManager {
  let client: ReturnType<typeof createOpenAI> | null = null;

  return {
    async ensure(): Promise<ReturnType<typeof createOpenAI>> {
      if (client) {
        return client;
      }

      const apiKey = await secretResolver.getSecret('OPENAI_API_KEY');
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is required to use the OpenAI provider.');
      }

      client = createOpenAI({ apiKey });
      return client;
    },

    getModel(modelName: string) {
      if (!client) {
        throw new Error('OpenAI client not initialized. Call ensure() first.');
      }
      // Use standard AI SDK provider - NOT .responses()
      return client(modelName);
    },
  };
}
