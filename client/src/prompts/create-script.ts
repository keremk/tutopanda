import { z } from "zod";

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

export const lectureSegmentSchema = z.object({
  narration: z
    .string()
    .min(1, "Provide narration text for the segment."),
  backgroundMusic: z
    .string()
    .min(1, "Describe background music that supports the narration."),
  effect: z
    .string()
    .min(1, "Describe a tasteful sound effect that enhances the scene."),
  suggestedFormat: z
    .enum(["image", "map"], {
      required_error: "Choose a visual treatment for the segment.",
      invalid_type_error: "Select either 'image' or 'map' as the visual format.",
    })
    .catch("image"),
});

export const lectureScriptSchema = z.object({
  detailedSummary: z
    .string()
    .min(1, "Provide a detailed written summary for supplemental reading."),
  segments: z
    .array(lectureSegmentSchema)
    .min(1, "Include at least one segment for the lecture."),
});

export type LectureScript = z.infer<typeof lectureScriptSchema>;

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
