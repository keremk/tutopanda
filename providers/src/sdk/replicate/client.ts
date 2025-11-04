import Replicate from 'replicate';
import type { SecretResolver, ProviderLogger } from '../../types.js';

export interface ReplicateClientManager {
  ensure(): Promise<Replicate>;
}

export function createReplicateClientManager(
  secretResolver: SecretResolver,
  logger?: ProviderLogger,
): ReplicateClientManager {
  let client: Replicate | null = null;

  return {
    async ensure(): Promise<Replicate> {
      if (client) {
        return client;
      }
      const token = await secretResolver.getSecret('REPLICATE_API_TOKEN');
      if (!token) {
        throw new Error('REPLICATE_API_TOKEN is required to use the Replicate provider.');
      }
      client = new Replicate({ auth: token });
      return client;
    },
  };
}
