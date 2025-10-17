import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";
import {
  createVideoPromptDeveloperPrompt,
  buildPromptForVideoGeneration,
  videoPromptSchema,
} from "@/prompts/create-video-prompt";
import type { LectureScript } from "@/types/types";
import { LLM_MODELS } from "@/lib/models";
import type { VideoPromptGenerationResult } from "./types";

type LectureSegment = LectureScript["segments"][number];

/**
 * Generate video prompts for a single segment using LLM.
 * Returns both image prompt (for starting frame) and movie directions.
 */
export async function generateVideoPrompts(
  segment: LectureSegment,
  lectureSummary: string,
  segmentIndex: number
): Promise<VideoPromptGenerationResult> {
  const userPrompt = buildPromptForVideoGeneration({
    segment,
    lectureSummary,
    segmentIndex,
  });

  const { object } = await generateObject({
    model: openai(LLM_MODELS.GPT_5_MINI),
    system: createVideoPromptDeveloperPrompt,
    prompt: userPrompt,
    schema: videoPromptSchema,
  });

  return {
    segmentStartImagePrompt: object.segment_start_image,
    movieDirections: object.movie_directions,
  };
}
