import { z } from "zod";
import type { LectureScript } from "@/types/types";
import { buildStyledImagePrompt, getImageStyleMetadata, type ImageStyleValue } from "@/lib/image-styles";

type LectureSegment = LectureScript["segments"][number];

export const createVideoPromptDeveloperPrompt = `
You are a well-renowned documentary filmmaker. You will be given a narrative for a short 10 second segment in the documentary, as well as the summary of the overall documentary. Your task is to generate:
- An image prompt for the first scene of 10s segment. This image prompts will be used to generate those images and then the image will be fed into a movie generator to generate a movie clip that starts with that image.
- A prompt for the movie generator to help set the mood, camera movements and the cut scenes for the overall 10 second movie. Make sure the cut scenes are separated with [cut] markers. (See example)

# Important Instructions:
- Do not include music or SFX instructions, just video
- Do not include any text generation instructions. No text allowed in the image or movie.
- Ensure that instructions are appropriate for the time period. Example: "city skyline" is not appropriate instruction for 18th century Paris.

# Movie prompt example:
Mood: Energetic, inspiring, and kid-friendly—symbolic action without violence. Colorful, pastel, hand-painted anime look with soft outlines and lively fabric/flag motion.
[cut] Slow dolly-in from a mid shot to a low-angle view of the Bastille. Flags and ribbons flutter in the breeze; sunbeams and dust motes drift. Subtle drumroll builds.
[cut] Quick close-ups—hands passing a rope; a glinting key; a wooden latch clicking; a barrel labeled "Poudre" (gunpowder) in a safe, symbolic way. Rhythm matches snare taps.
[cut] Return to the crowd: they surge forward with hopeful cheers. Doves take off past camera. A parchment ribbon appears briefly with hand-lettered "Change is coming!" as the drumroll resolves into bright strings.
`.trim();

export const videoPromptSchema = z.object({
  segment_start_image: z.string().describe("Prompt describing the starting image for the video segment as determined from the narrative."),
  movie_directions: z.string().describe("Prompt describing the movie generator's directions, including camera moves, style, and cut-scene descriptions."),
});

export type VideoPromptRequest = {
  segment: LectureSegment;
  lectureSummary: string;
  segmentIndex: number;
};

export const buildPromptForVideoGeneration = ({
  segment,
  lectureSummary,
  segmentIndex,
}: VideoPromptRequest) => {
  const narration = segment.narration.trim();

  return `
# Overall Documentary Summary:
${lectureSummary}

# Segment ${segmentIndex + 1} Narrative:
${narration}

Generate the starting image prompt and movie directions for this 10-second segment.
`.trim();
};

/**
 * Apply style to image prompt (used in orchestrator)
 */
export const buildStyledVideoImagePrompt = ({
  basePrompt,
  style,
}: {
  basePrompt: string;
  style?: ImageStyleValue | null;
}) => {
  return buildStyledImagePrompt({ basePrompt, style });
};

/**
 * Apply style to movie directions (used in orchestrator)
 */
export const buildStyledMovieDirections = ({
  baseDirections,
  style,
}: {
  baseDirections: string;
  style?: ImageStyleValue | null;
}) => {
  // Prepend style information to movie directions
  if (!style) return baseDirections;

  const styleMetadata = getImageStyleMetadata(style);
  if (!styleMetadata) return baseDirections;

  return `Style: ${styleMetadata.description}\n\n${baseDirections}`;
};
