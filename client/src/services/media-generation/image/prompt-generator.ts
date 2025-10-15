import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import {
  createImagePromptDeveloperPrompt,
  buildPromptForImageGeneration,
  singleImagePromptSchema,
  multipleImagePromptsSchema,
} from "@/prompts/create-image-prompt";
import type { PromptGenerationOptions } from "./types";
import { LLM_MODELS } from "@/lib/models";

/**
 * Generate base image prompts for a segment using Vercel AI SDK.
 * Returns prompts without style embellishments so they can be combined later.
 */
export async function generatePromptsForSegment(
  options: PromptGenerationOptions
): Promise<string[]> {
  const { segment, segmentIndex, imagesPerSegment } = options;

  const userPrompt = buildPromptForImageGeneration({
    segment,
    segmentIndex,
    imagesPerSegment,
  });

  const schema =
    imagesPerSegment > 1 ? multipleImagePromptsSchema : singleImagePromptSchema;

  const { object } = await generateObject({
    model: openai(LLM_MODELS.GPT_5_MINI),
    system: createImagePromptDeveloperPrompt,
    prompt: userPrompt,
    schema,
  });

  const basePrompts =
    imagesPerSegment > 1
      ? (object as { prompts: string[] }).prompts
      : [(object as { prompt: string }).prompt];

  return basePrompts;
}
