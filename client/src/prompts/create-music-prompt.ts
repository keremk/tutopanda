import type { LectureScript } from "@/types/types";

export const createMusicPromptSystemPrompt = [
  "You are well-renowned composer specialized in film scores, especially for documentaries.",
  "You will be given a script.",
  "Use that script to come up with a very descriptive prompt that will be used as an input to a music generator.",
  "The output prompt should specify the whole score, but not section by section, that is too much for the current technology of music generation AI to follow.",
  "So create a prompt that is 4-5 sentences max.",
  "Do not include any other information, just the prompt ready to be fed in.",
].join(" ");

export type MusicPromptRequest = {
  script: LectureScript;
  durationSeconds: number;
};

export const buildMusicPromptUserMessage = ({
  script,
  durationSeconds,
}: MusicPromptRequest) => {
  const durationMinutes = Math.round(durationSeconds / 60);

  const scriptText = script.segments
    .map((segment, index) => `Scene ${index + 1} / ${segment.narration}`)
    .join("\n\n");

  return [
    "Script:",
    scriptText,
    "",
    `The music should be approximately ${durationMinutes} minutes.`,
    "",
    "Create a descriptive prompt for a music generator that captures the tone and mood of this documentary script.",
  ].join("\n");
};