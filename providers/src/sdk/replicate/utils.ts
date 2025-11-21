import type { ProviderJobContext } from '../../types.js';

export interface PlannerContext {
  index?: {
    segment?: number;
    image?: number;
  };
  [key: string]: unknown;
}

/**
 * Extracts planner context from provider job context.
 */
export function extractPlannerContext(request: ProviderJobContext): PlannerContext {
  const extras = request.context.extras;
  const planner = extras && typeof extras === 'object' ? (extras as Record<string, unknown>).plannerContext : null;
  return planner && typeof planner === 'object' ? (planner as PlannerContext) : {};
}

/**
 * Merges default values with custom attributes/overrides.
 * Custom attributes take precedence over defaults.
 */
export function mergeInputs(
  defaults: Record<string, unknown>,
  customAttributes?: Record<string, unknown> | null,
): Record<string, unknown> {
  return {
    ...defaults,
    ...(customAttributes ?? {}),
  };
}

/**
 * Type guard to check if value is a record object.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
