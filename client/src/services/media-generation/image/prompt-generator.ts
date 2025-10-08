import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import {
  createImagePromptDeveloperPrompt,
  buildImagePromptUserMessage,
  singleImagePromptSchema,
  multipleImagePromptsSchema,
} from "@/prompts/create-image-prompt";
import type { PromptGenerationOptions } from "./types";

/**
 * Generate image prompts for a segment using Vercel AI SDK.
 * Returns an array of styled prompts ready for image generation.
 */
export async function generatePromptsForSegment(
  options: PromptGenerationOptions
): Promise<string[]> {
  const { segment, segmentIndex, imagesPerSegment, style } = options;

  const userPrompt = buildImagePromptUserMessage({
    segment,
    segmentIndex,
    imagesPerSegment,
  });

  const schema =
    imagesPerSegment > 1 ? multipleImagePromptsSchema : singleImagePromptSchema;

  const { object } = await generateObject({
    model: openai("gpt-5-mini"),
    system: createImagePromptDeveloperPrompt,
    prompt: userPrompt,
    schema,
  });

  const basePrompts =
    imagesPerSegment > 1
      ? (object as { prompts: string[] }).prompts
      : [(object as { prompt: string }).prompt];

  // Apply style prefix if specified
  const stylePrefix = style ? `${style} style, ` : "";
  const styledPrompts = basePrompts.map((p) => `${stylePrefix}${p}`);

  return styledPrompts;
}
