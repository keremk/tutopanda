import { z } from "zod";

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
  segments: z.array(lectureSegmentSchema).min(1, "Include at least one segment."),
});

export const aspectRatioValues = [
  "1:1",
  "4:3",
  "3:4",
  "16:9",
  "9:16",
  "21:9",
  "3:2",
  "2:3",
] as const;
const baseAssetSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
});

export const imageAssetSchema = baseAssetSchema
  .extend({
    prompt: z.string(),
    aspectRatio: z.enum(aspectRatioValues).optional(),
    width: z.number().nonnegative().optional(),
    height: z.number().nonnegative().optional(),
    size: z.string().optional(),
    sourceUrl: z.string().optional(),
  })
  .passthrough();

export const narrationAssetSchema = baseAssetSchema
  .extend({
    finalScript: z.string().optional(),
    model: z.string().optional(),
    voice: z.string().optional(),
    duration: z.number().nonnegative().optional(),
    sourceUrl: z.string().optional(),
  })
  .passthrough();

export const musicAssetSchema = baseAssetSchema
  .extend({
    prompt: z.string().optional(),
    duration: z.number().nonnegative().optional(),
    type: z.string().optional(),
    audioUrl: z.string().optional(),
    bpm: z.number().optional(),
    key: z.string().optional(),
  })
  .passthrough();

export const soundEffectAssetSchema = baseAssetSchema
  .extend({
    prompt: z.string().optional(),
    promptInfluence: z.number().optional(),
    duration: z.number().nonnegative().optional(),
    audioUrl: z.string().optional(),
    category: z.string().optional(),
  })
  .passthrough();

const timelineClipBaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  startTime: z.number().nonnegative(),
  duration: z.number().positive(),
});

export const kenBurnsClipSchema = timelineClipBaseSchema
  .extend({
    kind: z.literal("kenBurns"),
    imageAssetId: z.string().optional(),
    imageUrl: z.string().optional(),
    startScale: z.number().default(1),
    endScale: z.number().default(1.2),
    startX: z.number().default(0),
    startY: z.number().default(0),
    endX: z.number().default(0),
    endY: z.number().default(0),
  })
  .passthrough();

export const visualClipSchema = z.discriminatedUnion("kind", [
  kenBurnsClipSchema,
]);

export const voiceClipSchema = timelineClipBaseSchema
  .extend({
    kind: z.literal("voice"),
    narrationAssetId: z.string().optional(),
    audioUrl: z.string().optional(),
    volume: z.number().min(0).max(1).optional(),
  })
  .passthrough();

export const musicClipSchema = timelineClipBaseSchema
  .extend({
    kind: z.literal("music"),
    musicAssetId: z.string().optional(),
    audioUrl: z.string().optional(),
    volume: z.number().min(0).max(1).optional(),
    fadeInDuration: z.number().nonnegative().optional(),
    fadeOutDuration: z.number().nonnegative().optional(),
  })
  .passthrough();

export const soundFxClipSchema = timelineClipBaseSchema
  .extend({
    kind: z.literal("soundFx"),
    effectAssetId: z.string().optional(),
    audioUrl: z.string().optional(),
    volume: z.number().min(0).max(1).optional(),
  })
  .passthrough();

export const timelineTracksSchema = z.object({
  visual: z.array(visualClipSchema),
  voice: z.array(voiceClipSchema),
  music: z.array(musicClipSchema),
  soundEffects: z.array(soundFxClipSchema),
});

export const timelineTrackKeys = [
  "visual",
  "voice",
  "music",
  "soundEffects",
] as const;

export const timelineSchema = z.object({
  id: z.string(),
  name: z.string(),
  duration: z.number(),
  tracks: timelineTracksSchema,
});

export const lectureContentSchema = z.object({
  script: lectureScriptSchema.nullable(),
  images: z.array(imageAssetSchema).nullish(),
  narration: z.array(narrationAssetSchema).nullish(),
  music: z.array(musicAssetSchema).nullish(),
  effects: z.array(soundEffectAssetSchema).nullish(),
  timeline: timelineSchema.nullish(),
});

export type Timeline = z.infer<typeof timelineSchema>;
export type TimelineTracks = z.infer<typeof timelineTracksSchema>;
export type VisualClip = z.infer<typeof visualClipSchema>;
export type KenBurnsClip = z.infer<typeof kenBurnsClipSchema>;
export type VoiceClip = z.infer<typeof voiceClipSchema>;
export type MusicClip = z.infer<typeof musicClipSchema>;
export type SoundFxClip = z.infer<typeof soundFxClipSchema>;
export type TimelineTrackKey = typeof timelineTrackKeys[number];
export type AnyTimelineClip = VisualClip | VoiceClip | MusicClip | SoundFxClip;

export type LectureContent = z.infer<typeof lectureContentSchema>;
export type ImageAsset = z.infer<typeof imageAssetSchema>;
export type NarrationSettings = z.infer<typeof narrationAssetSchema>;
export type MusicSettings = z.infer<typeof musicAssetSchema>;
export type EffectsSettings = z.infer<typeof soundEffectAssetSchema>;
export type LectureScript = z.infer<typeof lectureScriptSchema>;

export type LectureSource = "app" | "workflow" | "system";

export type ImageGenerationDefaults = {
  width: number;
  height: number;
  aspectRatio: typeof aspectRatioValues[number];
  size: string;
};

export const DEFAULT_IMAGE_GENERATION_DEFAULTS: ImageGenerationDefaults = {
  width: 1024,
  height: 576,
  aspectRatio: "16:9",
  size: "1K",
};

export type NarrationGenerationDefaults = {
  model: string;
  voice: string;
};

export const DEFAULT_NARRATION_GENERATION_DEFAULTS: NarrationGenerationDefaults = {
  model: process.env.DEFAULT_VOICE_MODEL_ID || "eleven_v3",
  voice: process.env.DEFAULT_VOICE_ID || "onwK4e9ZLuTAKqWW03F9",
};

export type NormalisedLectureContent = Omit<LectureContent, "timeline"> & {
  timeline: Timeline | null;
};

export type LectureSnapshot = NormalisedLectureContent & {
  id: number;
  projectId: number;
  revision: number;
  updatedAt: Date;
};

export type LectureRevision = {
  id: number;
  lectureId: number;
  revision: number;
  data: NormalisedLectureContent;
  createdBy: string | null;
  source: LectureSource;
  runId: string | null;
  createdAt: Date;
};

export type WorkflowStatus = "queued" | "running" | "failed" | "succeeded";

export type WorkflowRun = {
  runId: string;
  lectureId: number;
  userId: string;
  status: WorkflowStatus;
  currentStep: number;
  totalSteps: number;
  context: Record<string, unknown> | null;
  updatedAt: Date;
  createdAt: Date;
};
