import { z } from "zod";
import {
  videoDurationValues,
  audienceValues,
  imageSizeValues,
  imageStyleValues,
  imageFormatValues,
  aspectRatioValues,
  segmentLengthValues,
} from "@/types/types";
import {
  imageModelValues,
  musicModelValues,
  soundEffectModelValues,
} from "@/lib/models";

// Partial schemas for config extraction - all fields optional
export const partialGeneralConfigSchema = z.object({
  duration: z.enum(videoDurationValues).optional(),
  scriptModel: z.string().optional(),
  audience: z.enum(audienceValues).optional(),
  useSubtitles: z.boolean().optional(),
  language: z.string().optional(),
  subtitleLanguage: z.string().optional(),
  useVideo: z.boolean().optional(),
  maxVideoSegments: z.number().int().min(0).optional(),
});

export const partialImageConfigSchema = z.object({
  size: z.enum(imageSizeValues).optional(),
  aspectRatio: z.enum(aspectRatioValues).optional(),
  imagesPerSegment: z.number().int().min(1).max(2).optional(),
  style: z.enum(imageStyleValues).optional(),
  format: z.enum(imageFormatValues).optional(),
  model: z.enum(imageModelValues).optional(),
});

export const partialNarrationConfigSchema = z.object({
  segmentLength: z.enum(segmentLengthValues).optional(),
  voice: z.string().optional(),
  model: z.string().optional(),
  emotion: z.string().optional(),
});

export const partialMusicConfigSchema = z.object({
  model: z.enum(musicModelValues).optional(),
});

export const partialSoundEffectConfigSchema = z.object({
  model: z.enum(soundEffectModelValues).optional(),
});

export const extractedConfigSchema = z.object({
  general: partialGeneralConfigSchema.optional(),
  image: partialImageConfigSchema.optional(),
  narration: partialNarrationConfigSchema.optional(),
  music: partialMusicConfigSchema.optional(),
  soundEffects: partialSoundEffectConfigSchema.optional(),
});

export type ExtractedConfig = z.infer<typeof extractedConfigSchema>;

export const extractConfigSystemPrompt = [
  "You are a configuration analyzer for a lecture video generation system.",
  "Your job is to analyze a user's prompt and extract any explicit configuration preferences they mention.",
  "",
  "Configuration categories and possible values:",
  "",
  "**General Settings:**",
  `- duration: ${videoDurationValues.join(", ")}`,
  `- audience: ${audienceValues.join(", ")}`,
  "- useSubtitles: true/false",
  "- language: two-letter code (e.g., 'en', 'es', 'fr')",
  "- useVideo: true/false (if they want video instead of just images)",
  "",
  "**Image Settings:**",
  `- size: ${imageSizeValues.join(", ")} (resolution in pixels)`,
  `- aspectRatio: ${aspectRatioValues.join(", ")}`,
  `- style: ${imageStyleValues.join(", ")}`,
  `- format: ${imageFormatValues.join(", ")}`,
  "",
  "**Narration Settings:**",
  `- segmentLength: ${segmentLengthValues.join(", ")}`,
  "- emotion: cheerful, serious, dramatic, etc.",
  "",
  "**Music & Sound:**",
  `- music model: ${musicModelValues.join(", ")}`,
  `- sound effects model: ${soundEffectModelValues.join(", ")}`,
  "",
  "**Important Rules:**",
  "1. ONLY extract preferences that are explicitly mentioned in the prompt",
  "2. Do NOT make assumptions or add preferences that aren't stated",
  "3. If nothing is mentioned, return an empty object {}",
  "4. Be flexible with phrasing - understand variations like '1080p', 'HD', 'high quality' → size: '1080'",
  "5. Map style mentions to the closest valid value (e.g., 'Studio Ghibli' → 'Ghibli')",
  "6. Return ONLY the extracted config object, no explanation or commentary",
].join("\n");

export function buildExtractConfigPrompt(userPrompt: string): string {
  return [
    "Analyze this user prompt and extract any configuration preferences:",
    "",
    `"${userPrompt.trim()}"`,
    "",
    "Return only the configuration fields that are explicitly mentioned.",
  ].join("\n");
}
