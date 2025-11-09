import type { OpenAiLlmConfig } from './config.js';

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
): RenderedPrompts {
  const system = substituteVariables(config.systemPrompt, inputs);
  const user = config.userPrompt ? substituteVariables(config.userPrompt, inputs) : undefined;

  return { system, user };
}

/**
 * Substitutes {{VariableName}} placeholders with values from inputs.
 * Uses simple direct lookup - variable names must match input keys exactly.
 */
function substituteVariables(template: string, inputs: Record<string, unknown>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    const value = inputs[varName];
    if (value == null) {
      console.warn('[openai] Missing input for prompt variable', varName);
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
