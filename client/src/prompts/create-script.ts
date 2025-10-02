export { generatedScriptSchema, generatedSegmentSchema } from "@/types/types";
export type { LectureScript } from "@/types/types";

// For backwards compatibility, export the generated schema as the expected name
export { generatedScriptSchema as lectureScriptSchema } from "@/types/types";

export const createScriptSystemPrompt = [
  "You are an expert historical researcher and documentary script writer.",
  "The user will supply a historical topic and wants to learn about it.",
  "Your job is to produce a three-minute, documentary-style narrated lecture.",
  "The lecture is delivered to an adult audience, so keep the tone mature and informative.",
  "Divide the lecture into short visual segments that synchronize with the narration.",
  "Each segment should propose supporting visuals such as period imagery or maps.",
  "Incorporate background music cues and tasteful sound effects that enhance the story.",
  "Research the topic carefully before writing so the content is factual and recent.",
  "Always return content that strictly matches the output schema; no additional commentary.",
].join("\n");

export const lectureScriptSchemaName = "presentation";
export const lectureScriptSchemaDescription =
  "Documentary-style three minute lecture broken into narrated visual segments.";

export function buildCreateScriptPrompt(topic: string) {
  return [
    "Write the narrated lecture that will fit in roughly three minutes.",
    "Aim for segments that are around fifteen seconds each, but adjust as needed.",
    "Narration should contain only the spoken words without stage directions.",
    "Topic:",
    topic.trim(),
  ]
    .filter(Boolean)
    .join("\n\n");
}
