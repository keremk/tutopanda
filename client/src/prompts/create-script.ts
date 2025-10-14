import type { GeneralConfig, NarrationConfig } from "@/types/types";
import {
  languageLabels,
  segmentLengthDescriptions,
  videoDurationDescriptions,
} from "@/types/types";

export { generatedScriptSchema, generatedSegmentSchema } from "@/types/types";
export type { LectureScript } from "@/types/types";

// For backwards compatibility, export the generated schema as the expected name
export { generatedScriptSchema as lectureScriptSchema } from "@/types/types";

const AUDIENCE_TONE_INSTRUCTIONS: Record<GeneralConfig["audience"], string> = {
  Kids:
    "Use a playful, energetic tone with simple explanations, vivid imagery, and reassuring guidance suited for children.",
  "Young Adults":
    "Adopt a relatable and dynamic tone that balances modern references with clear explanations to keep young adults engaged.",
  Adults:
    "Maintain a confident, informative tone that respects prior knowledge while still providing crisp context for any complex ideas.",
  Academic:
    "Write with scholarly precision, cite relevant sources or historians when appropriate, and assume the audience values rigor.",
  "Enthusiast/Niche":
    "Lean into detailed storytelling and specialized terminology, assuming the audience welcomes depth and niche insights.",
};

export const createScriptSystemPrompt = `
You are an expert historical researcher and documentary script writer.
The user will supply a historical topic and wants to learn about it.
Your job is to produce a documentary-style narrated lecture tailored to the provided configuration.
Divide the lecture into visual segments that synchronize with the narration.
Each segment should propose supporting visuals such as period imagery or maps.
Incorporate background music cues and tasteful sound effects that enhance the story.
Research the topic carefully before writing so the content is factual and recent.
Always return content that strictly matches the output schema; no additional commentary.
`.trim();

export const lectureScriptSchemaName = "presentation";
export const lectureScriptSchemaDescription =
  "Documentary-style narrated lecture broken into visual segments.";

type BuildCreateScriptPromptOptions = {
  topic: string;
  general: GeneralConfig;
  narration: NarrationConfig;
};

export function buildCreateScriptPrompt({
  topic,
  general,
  narration,
}: BuildCreateScriptPromptOptions) {
  const trimmedTopic = topic.trim();
  const durationDescription = videoDurationDescriptions[general.duration];
  const segmentLengthDescription = segmentLengthDescriptions[narration.segmentLength];
  const audienceInstruction = AUDIENCE_TONE_INSTRUCTIONS[general.audience];
  const languageName = languageLabels[general.language];

  return `
Write the narrated lecture so the total speaking time covers ${durationDescription}.

Structure the content into segments that align with ${segmentLengthDescription}, adjusting when the narrative flow demands it.

${audienceInstruction}

Deliver the narration in ${languageName}, keeping terminology accurate for that language and avoiding stage directions.

Topic:
${trimmedTopic}
`.trim();
}
