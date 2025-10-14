import { title } from "process";
import { z } from "zod";
import {
  imageModelValues,
  musicModelValues,
  soundEffectModelValues,
  videoModelValues,
  DEFAULT_IMAGE_MODEL,
  DEFAULT_MUSIC_MODEL,
  DEFAULT_SOUND_EFFECT_MODEL,
  DEFAULT_VIDEO_MODEL,
  DEFAULT_SCRIPT_MODEL,
  DEFAULT_VOICE_ID,
  DEFAULT_VOICE_MODEL_ID,
} from "@/lib/models";

// Application-level schemas (stored in database)
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
});

export const lectureScriptSchema = z.object({
  segments: z.array(lectureSegmentSchema).min(1, "Include at least one segment."),
});

// LLM generation schemas (used for AI model output)
export const generatedSegmentSchema = z.object({
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

export const generatedScriptSchema = z.object({
  title: z.string().min(1, "Provide a concise title for the lecture, not more than 3 to 5 words."),
  detailedSummary: z
    .string()
    .min(1, "Provide a detailed written summary for supplemental reading."),
  segments: z.array(generatedSegmentSchema).min(1, "Include at least one segment."),
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

export const kenBurnsEffectNames = [
  "portraitZoomIn",
  "portraitZoomOut",
  "landscapePanLeft",
  "landscapePanRight",
  "architectureRise",
  "architectureDescend",
  "dramaticZoomIn",
  "dramaticZoomOut",
  "zoomInPanLeft",
  "zoomInPanRight",
  "zoomInPanUp",
  "zoomInPanDown",
  "diagonalZoomInUpRight",
  "diagonalZoomInDownLeft",
  "technicalSubtleZoom",
  "technicalPanRight",
  "energeticReveal",
] as const;

const baseAssetSchema = z.object({
  id: z.string(),
  label: z.string().optional(),
});

export const imageAssetSchema = baseAssetSchema
  .extend({
    prompt: z.string(),
    model: z.string().optional(),
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
    effectName: z.string().optional(),
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

// Configuration schemas
export const videoDurationValues = ["30", "60", "180", "600"] as const;
export const audienceValues = [
  "Kids",
  "Young Adults",
  "Adults",
  "Academic",
  "Enthusiast/Niche"
] as const;
export const imageSizeValues = ["480", "720", "1080"] as const;
export const imageStyleValues = ["Ghibli", "Pixar", "Anime", "Watercolor", "Cartoon", "Photorealistic"] as const;
export const imageFormatValues = ["JPG", "PNG"] as const;
export const videoDurationSegmentValues = ["5", "10"] as const;
export const segmentLengthValues = ["10", "15"] as const;
export const reasoningEffortValues = ["minimal", "low", "medium", "high"] as const;
export const reasoningSummaryValues = ["auto", "concise", "detailed"] as const;
export const languageValues = ["en", "es", "fr", "de", "tr"] as const;

export const languageLabels: Record<(typeof languageValues)[number], string> = {
  en: "English",
  es: "Spanish",
  fr: "French",
  de: "German",
  tr: "Turkish",
};

export const videoDurationLabels: Record<(typeof videoDurationValues)[number], string> = {
  "30": "30s",
  "60": "1min",
  "180": "3min",
  "600": "10min",
};

export const videoDurationDescriptions: Record<(typeof videoDurationValues)[number], string> = {
  "30": "about 30 seconds",
  "60": "about 1 minute",
  "180": "about 3 minutes",
  "600": "about 10 minutes",
};

export const segmentLengthLabels: Record<(typeof segmentLengthValues)[number], string> = {
  "10": "10 seconds",
  "15": "15 seconds",
};

export const segmentLengthDescriptions: Record<(typeof segmentLengthValues)[number], string> = {
  "10": "approximately 10 seconds of narration",
  "15": "approximately 15 seconds of narration",
};

export const generalConfigSchema = z.object({
  duration: z.enum(videoDurationValues),
  audience: z.enum(audienceValues),
  useSubtitles: z.boolean(),
  language: z.enum(languageValues),
  subtitleLanguage: z.string().optional(),
  useVideo: z.boolean(),
  maxVideoSegments: z.number().int().min(0).optional(),
});

export const researchConfigSchema = z.object({
  model: z.string(),
  reasoningEffort: z.enum(reasoningEffortValues),
  reasoningSummary: z.enum(reasoningSummaryValues),
});

export const imageConfigSchema = z.object({
  size: z.enum(imageSizeValues),
  aspectRatio: z.enum(aspectRatioValues),
  imagesPerSegment: z.number().int().min(1).max(2),
  style: z.enum(imageStyleValues),
  format: z.enum(imageFormatValues),
  model: z.string(),
});

export const videoConfigSchema = z.object({
  model: z.string(),
  duration: z.enum(videoDurationSegmentValues),
});

export const narrationConfigSchema = z.object({
  segmentLength: z.enum(segmentLengthValues),
  voice: z.string(),
  model: z.string(),
  emotion: z.string().optional(),
});

export const musicConfigSchema = z.object({
  model: z.string(),
});

export const soundEffectConfigSchema = z.object({
  model: z.string(),
});

export const lectureConfigSchema = z.object({
  general: generalConfigSchema,
  research: researchConfigSchema,
  image: imageConfigSchema,
  video: videoConfigSchema,
  narration: narrationConfigSchema,
  music: musicConfigSchema,
  soundEffects: soundEffectConfigSchema,
});

export const lectureContentSchema = z.object({
  title: z.string().min(1, "Lecture must have a title."),
  summary: z
    .string()
    .nullable(),
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
  style?: typeof imageStyleValues[number];
  imagesPerSegment?: number;
};

export const DEFAULT_IMAGE_GENERATION_DEFAULTS: ImageGenerationDefaults = {
  width: 1024,
  height: 576,
  aspectRatio: "16:9",
  size: "1K",
  style: "Ghibli",
  imagesPerSegment: 1,
};

export type NarrationGenerationDefaults = {
  model: string;
  voice: string;
};

export const DEFAULT_NARRATION_GENERATION_DEFAULTS: NarrationGenerationDefaults = {
  model: DEFAULT_VOICE_MODEL_ID,
  voice: DEFAULT_VOICE_ID,
};

export type LectureConfig = z.infer<typeof lectureConfigSchema>;
export type GeneralConfig = z.infer<typeof generalConfigSchema>;
export type ResearchConfig = z.infer<typeof researchConfigSchema>;
export type ImageConfig = z.infer<typeof imageConfigSchema>;
export type VideoConfig = z.infer<typeof videoConfigSchema>;
export type NarrationConfig = z.infer<typeof narrationConfigSchema>;
export type MusicConfig = z.infer<typeof musicConfigSchema>;
export type SoundEffectConfig = z.infer<typeof soundEffectConfigSchema>;

export const DEFAULT_LECTURE_CONFIG: LectureConfig = {
  general: {
    duration: "60",
    audience: "Adults",
    useSubtitles: false,
    language: "en",
    useVideo: false,
    maxVideoSegments: 0,
  },
  research: {
    model: DEFAULT_SCRIPT_MODEL,
    reasoningEffort: "medium",
    reasoningSummary: "detailed",
  },
  image: {
    size: "1080",
    aspectRatio: "16:9",
    imagesPerSegment: 1,
    style: "Ghibli",
    format: "PNG",
    model: DEFAULT_IMAGE_MODEL,
  },
  video: {
    model: DEFAULT_VIDEO_MODEL,
    duration: "5",
  },
  narration: {
    segmentLength: "15",
    voice: DEFAULT_VOICE_ID,
    model: DEFAULT_VOICE_MODEL_ID,
  },
  music: {
    model: DEFAULT_MUSIC_MODEL,
  },
  soundEffects: {
    model: DEFAULT_SOUND_EFFECT_MODEL,
  },
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
