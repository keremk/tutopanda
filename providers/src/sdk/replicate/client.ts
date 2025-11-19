import Replicate from 'replicate';
import type { SecretResolver, ProviderLogger, ProviderMode } from '../../types.js';
import type { SchemaRegistry } from '../../schema-registry.js';

export interface ReplicateClientManager {
  ensure(): Promise<Replicate>;
}

export function createReplicateClientManager(
  secretResolver: SecretResolver,
  logger?: ProviderLogger,
  mode: ProviderMode = 'live',
  schemaRegistry?: SchemaRegistry,
): ReplicateClientManager {
  let client: Replicate | null = null;

  return {
    async ensure(): Promise<Replicate> {
      if (client) {
        return client;
      }

      if (mode === 'simulated') {
        client = createMockReplicateClient(schemaRegistry) as unknown as Replicate;
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

function createMockReplicateClient(schemaRegistry?: SchemaRegistry) {
  return {
    async run(identifier: string, options: { input: Record<string, unknown> }) {
      const [owner, modelName] = identifier.split('/');
      // Handle version hash if present (e.g. owner/model:version)
      const cleanModelName = modelName ? modelName.split(':')[0] : '';
      const fullModelName = `${owner}/${cleanModelName}`;
      
      if (schemaRegistry) {
        const entry = schemaRegistry.get('replicate', fullModelName);
        if (entry && entry.sdkMapping) {
          validateInput(options.input, entry.sdkMapping);
        }
      }

      return ['https://mock.replicate.com/output.png'];
    },
  };
}

function validateInput(input: Record<string, unknown>, mapping: Record<string, { field: string; required?: boolean; type: string }>) {
  for (const [key, rule] of Object.entries(mapping)) {
    const value = input[rule.field];
    
    if (rule.required && (value === undefined || value === null || value === '')) {
      throw new Error(`Missing required input field: ${rule.field} (mapped from ${key})`);
    }

    if (value !== undefined && value !== null) {
       if (rule.type === 'string' && typeof value !== 'string') {
         throw new Error(`Invalid type for field ${rule.field}. Expected string, got ${typeof value}`);
       }
       if (rule.type === 'number' && typeof value !== 'number') {
         throw new Error(`Invalid type for field ${rule.field}. Expected number, got ${typeof value}`);
       }
       if (rule.type === 'boolean' && typeof value !== 'boolean') {
         throw new Error(`Invalid type for field ${rule.field}. Expected boolean, got ${typeof value}`);
       }
    }
  }
}
