import type { LectureScript } from "@/prompts/create-script";

export const createImagePromptDeveloperPrompt = [
  "You are an expert documentary film maker and trying to select the best scene that describes the key point in a narrative.",
  "You will be given the narrative text.",
  "Use the narrative text to come up with a prompt that best describes the key point in that narrative to be fed into an image generation model.",
  "The image will be generated using a diffusion model using that prompt, and make sure that there are no instructions to generate any text in the image.",
  "Only pick up one or two most key points, DO NOT TRY to depict every possible point as it will lead to a very crowded scene.",
  "The scene should succinctly and unambiguously present the main point.",
].join(" ");

type LectureSegment = LectureScript["segments"][number];

export type ImagePromptRequest = {
  runId: string;
  segmentIndex: number;
  segment: LectureSegment;
};

export const buildImagePromptUserMessage = ({
  segment,
  segmentIndex,
}: Pick<ImagePromptRequest, "segment" | "segmentIndex">) => {
  const narration = segment.narration.trim();
  const summary = [
    `Segment ${segmentIndex + 1}`,
    narration,
    segment.backgroundMusic?.trim(),
    segment.effect?.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");

  return [
    "Narrative excerpt:",
    summary,
    "Respond with a concise, vivid prompt for an image generation diffusion model that captures the primary idea. Do not include text generation instructions.",
  ]
    .filter(Boolean)
    .join("\n\n");
};

