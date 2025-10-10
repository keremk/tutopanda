import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";
import {
  createMusicPromptSystemPrompt,
  buildMusicPromptUserMessage,
} from "@/prompts/create-music-prompt";
import type { LectureScript } from "@/types/types";
import { LLM_MODELS } from "@/lib/models";

/**
 * Generate a music prompt for a lecture script using Vercel AI SDK.
 * Returns a prompt suitable for music generation models.
 */
export async function generateMusicPrompt(
  script: LectureScript,
  durationSeconds: number
): Promise<string> {
  const userPrompt = buildMusicPromptUserMessage({
    script,
    durationSeconds,
  });

  const { text } = await generateText({
    model: openai(LLM_MODELS.GPT_4O),
    system: createMusicPromptSystemPrompt,
    prompt: userPrompt,
  });

  const promptText = text.trim();

  if (!promptText) {
    throw new Error("Model returned empty music prompt");
  }

  return promptText;
}
