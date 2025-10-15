import { z } from "zod";
import { buildStyledImagePrompt, type ImageStyleValue } from "@/lib/image-styles";
import type { LectureScript } from "@/prompts/create-script";

export const createImagePromptDeveloperPrompt = `
You are an expert documentary filmmaker choosing a single compelling scene that illustrates the key point in a narrative.
You will be given the narrative text.
Use the narrative text to craft a prompt that highlights the core idea for an image generation model.
The image will be produced by a diffusion model; do not instruct it to render any text or lettering.
Focus on one or two essential details so the scene remains clear and uncluttered.
The resulting scene should deliver the primary idea with clarity and emotional resonance.
`.trim();

type LectureSegment = LectureScript["segments"][number];

// Schema for single image prompt
export const singleImagePromptSchema = z.object({
  prompt: z.string().describe("A concise, vivid prompt for an image generation model"),
});

// Schema for multiple image prompts
export const multipleImagePromptsSchema = z.object({
  prompts: z.array(z.string()).describe("Array of distinct image prompts, each capturing a different key moment"),
});

export type ImagePromptRequest = {
  runId: string;
  segmentIndex: number;
  segment: LectureSegment;
  imagesPerSegment?: number;
};

export const buildPromptForImageGeneration = ({
  segment,
  segmentIndex,
  imagesPerSegment = 1,
}: Pick<ImagePromptRequest, "segment" | "segmentIndex" | "imagesPerSegment">) => {
  const narration = segment.narration.trim();
  const summary = [
    `Segment ${segmentIndex + 1}`,
    narration,
    segment.backgroundMusic?.trim(),
    segment.effect?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  const countInstruction = imagesPerSegment > 1
    ? `Generate exactly ${imagesPerSegment} distinct image prompts. Each prompt should capture a different key moment or aspect from the narrative.`
    : null;

  return `
Narrative excerpt:
${summary}

Create a concise, vivid prompt for an image generation diffusion model that captures the primary idea. Do not include text generation instructions.${countInstruction ? `\n\n${countInstruction}` : ""}`.trim();
};

type BuildImageGenerationPromptOptions = {
  basePrompt: string;
  segment?: LectureSegment;
  style?: ImageStyleValue | null;
};

export const buildImageGenerationPrompt = ({
  basePrompt,
  segment,
  style,
}: BuildImageGenerationPromptOptions) => {
  const fallbackPrompt = segment
    ? [
        segment.narration.trim(),
        segment.backgroundMusic?.trim(),
        segment.effect?.trim(),
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  const promptSource = basePrompt.trim() || fallbackPrompt;
  return buildStyledImagePrompt({
    basePrompt: promptSource,
    style,
  });
};
