import type { OpenAiLlmConfig } from './config.js';
import type { ProviderLogger } from '../../types.js';

export interface RenderedPrompts {
  system: string;
  user?: string;
}

/**
 * Renders prompts with variable substitution.
 * Variables are replaced using {{VariableName}} syntax.
 *
 * @example
 * Config:
 *   variables: ["InquiryPrompt", "Duration"]
 *   userPrompt: "Topic: {{InquiryPrompt}}\nDuration: {{Duration}}"
 *
 * Inputs:
 *   { InquiryPrompt: "French Revolution", Duration: "30 seconds" }
 *
 * Result:
 *   "Topic: French Revolution\nDuration: 30 seconds"
 */
export function renderPrompts(
  config: OpenAiLlmConfig,
  inputs: Record<string, unknown>,
  logger?: ProviderLogger,
): RenderedPrompts {
  const system = substituteVariables(config.systemPrompt, inputs, logger);
  const user = config.userPrompt ? substituteVariables(config.userPrompt, inputs, logger) : undefined;

  return { system, user };
}

/**
 * Substitutes {{VariableName}} placeholders with values from inputs.
 * Uses simple direct lookup - variable names must match input keys exactly.
 */
function substituteVariables(
  template: string,
  inputs: Record<string, unknown>,
  logger?: ProviderLogger,
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const value = inputs[varName];
    if (value === null || value === undefined) {
      logger?.warn?.('openai.prompts.missingInput', { variable: varName });
      return '';
    }
    return String(value);
  });
}

/**
 * Builds the prompt string for AI SDK from rendered prompts.
 * Prefers user prompt if available, falls back to system prompt.
 */
export function buildPrompt(rendered: RenderedPrompts): string {
  return rendered.user?.trim() || rendered.system?.trim() || '';
}
