import type { CustomBlueprintConfig, SectionConnection } from '../types.js';

/**
 * Parse and validate a custom blueprint configuration.
 */
export function parseCustomBlueprintConfig(raw: unknown): CustomBlueprintConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Blueprint config must be an object');
  }

  const config = raw as Record<string, unknown>;

  // Validate required fields
  if (typeof config.name !== 'string') {
    throw new Error('Blueprint config must have a "name" field (string)');
  }
  if (typeof config.version !== 'string') {
    throw new Error('Blueprint config must have a "version" field (string)');
  }
  if (!Array.isArray(config.sections)) {
    throw new Error('Blueprint config must have a "sections" field (array)');
  }
  if (!Array.isArray(config.connections)) {
    throw new Error('Blueprint config must have a "connections" field (array)');
  }

  // Validate sections array
  for (const section of config.sections) {
    if (typeof section !== 'string') {
      throw new Error('Each section must be a string (section ID)');
    }
  }

  // Validate connections array
  const connections: SectionConnection[] = [];
  for (const conn of config.connections) {
    if (typeof conn !== 'object' || conn === null) {
      throw new Error('Each connection must be an object');
    }

    const c = conn as Record<string, unknown>;
    if (typeof c.from !== 'object' || c.from === null) {
      throw new Error('Connection must have "from" field (object)');
    }
    if (typeof c.to !== 'object' || c.to === null) {
      throw new Error('Connection must have "to" field (object)');
    }

    const from = c.from as Record<string, unknown>;
    const to = c.to as Record<string, unknown>;

    if (typeof from.section !== 'string' || typeof from.port !== 'string') {
      throw new Error('Connection "from" must have "section" and "port" fields (strings)');
    }
    if (typeof to.section !== 'string' || typeof to.port !== 'string') {
      throw new Error('Connection "to" must have "section" and "port" fields (strings)');
    }

    connections.push({
      from: { section: from.section, port: from.port },
      to: { section: to.section, port: to.port },
    });
  }

  return {
    name: config.name,
    description: typeof config.description === 'string' ? config.description : undefined,
    version: config.version,
    sections: config.sections as string[],
    connections,
    blueprintConfig:
      typeof config.blueprintConfig === 'object' && config.blueprintConfig !== null
        ? (config.blueprintConfig as Record<string, unknown>)
        : undefined,
    autoConnect: typeof config.autoConnect === 'boolean' ? config.autoConnect : false,
  };
}
