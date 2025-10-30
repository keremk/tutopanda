import { z } from 'zod';

const LanguageEnum = z.enum(['en', 'de', 'es', 'fr', 'tr']);
const AspectRatioEnum = z.enum(['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9']);
const SizeEnum = z.enum(['480p', '720p', '1080p']);
const StyleEnum = z.enum(['Ghibli', 'Pixar', 'Anime', 'Watercolor', 'Cartoon', 'PhotoRealistic', 'Custom']);
const ImageFormatEnum = z.enum(['PNG', 'JPG']);

const GENERAL_DEFAULTS = {
  UseVideo: false,
  Audience: 'general',
  AudiencePrompt: '',
  Language: 'en',
  Duration: 60,
  AspectRatio: '16:9',
  Size: '480p',
  Style: 'Ghibli',
  CustomStyle: '',
} as const;

const GeneralConfigSchema = z
  .object({
    UseVideo: z.boolean().optional().default(GENERAL_DEFAULTS.UseVideo),
    Audience: z.string().optional().default(GENERAL_DEFAULTS.Audience),
    AudiencePrompt: z.string().optional().default(GENERAL_DEFAULTS.AudiencePrompt),
    Language: LanguageEnum.optional().default(GENERAL_DEFAULTS.Language),
    Duration: z.number().positive().optional().default(GENERAL_DEFAULTS.Duration),
    AspectRatio: AspectRatioEnum.optional().default(GENERAL_DEFAULTS.AspectRatio),
    Size: SizeEnum.optional().default(GENERAL_DEFAULTS.Size),
    Style: StyleEnum.optional().default(GENERAL_DEFAULTS.Style),
    CustomStyle: z.string().optional().default(GENERAL_DEFAULTS.CustomStyle),
  })
  .default(GENERAL_DEFAULTS);

const AUDIO_DEFAULTS = {
  Voice: 'Atlas',
  Emotion: 'dramatic',
  Model: '',
  Provider: '',
} as const;

const AudioConfigSchema = z
  .object({
    Voice: z.string().optional().default(AUDIO_DEFAULTS.Voice),
    Emotion: z.string().optional().default(AUDIO_DEFAULTS.Emotion),
    Model: z.string().optional().default(AUDIO_DEFAULTS.Model),
    Provider: z.string().optional().default(AUDIO_DEFAULTS.Provider),
  })
  .default(AUDIO_DEFAULTS);

const MUSIC_DEFAULTS = {
  Prompt: '',
  Model: '',
  Provider: '',
} as const;

const MusicConfigSchema = z
  .object({
    Prompt: z.string().optional().default(MUSIC_DEFAULTS.Prompt),
    Model: z.string().optional().default(MUSIC_DEFAULTS.Model),
    Provider: z.string().optional().default(MUSIC_DEFAULTS.Provider),
  })
  .default(MUSIC_DEFAULTS);

const SCRIPT_DEFAULTS = {
  Model: '',
  Provider: '',
  ReasoningEffort: '',
} as const;

const ScriptGenerationConfigSchema = z
  .object({
    Model: z.string().optional().default(SCRIPT_DEFAULTS.Model),
    Provider: z.string().optional().default(SCRIPT_DEFAULTS.Provider),
    ReasoningEffort: z.string().optional().default(SCRIPT_DEFAULTS.ReasoningEffort),
  })
  .default(SCRIPT_DEFAULTS);

const IMAGE_DEFAULTS = {
  Format: 'PNG',
  Model: '',
  Provider: '',
  ImagesPerSegment: 2,
} as const;

const ImageConfigSchema = z
  .object({
    Format: ImageFormatEnum.optional().default(IMAGE_DEFAULTS.Format),
    Model: z.string().optional().default(IMAGE_DEFAULTS.Model),
    Provider: z.string().optional().default(IMAGE_DEFAULTS.Provider),
    ImagesPerSegment: z.number().int().positive().optional().default(IMAGE_DEFAULTS.ImagesPerSegment),
  })
  .default(IMAGE_DEFAULTS);

const VIDEO_DEFAULTS = {
  Model: '',
  Provider: '',
  ImageModel: '',
  ImageProvider: '',
  IsImageToVideo: false,
  ImageToVideo: {} as Record<string, boolean>,
  AssemblyStrategy: 'speed-adjustment',
  SegmentAnimations: {} as Record<string, unknown>,
} as const;

const VideoConfigSchema = z
  .object({
    Model: z.string().optional().default(VIDEO_DEFAULTS.Model),
    Provider: z.string().optional().default(VIDEO_DEFAULTS.Provider),
    ImageModel: z.string().optional().default(VIDEO_DEFAULTS.ImageModel),
    ImageProvider: z.string().optional().default(VIDEO_DEFAULTS.ImageProvider),
    IsImageToVideo: z.boolean().optional().default(VIDEO_DEFAULTS.IsImageToVideo),
    ImageToVideo: z.record(z.string(), z.boolean()).optional().default(VIDEO_DEFAULTS.ImageToVideo),
    AssemblyStrategy: z.string().optional().default(VIDEO_DEFAULTS.AssemblyStrategy),
    SegmentAnimations: z.record(z.string(), z.unknown()).optional().default(VIDEO_DEFAULTS.SegmentAnimations),
  })
  .default(VIDEO_DEFAULTS);

export const ProjectConfigSchema = z
  .object({
    General: GeneralConfigSchema,
    Audio: AudioConfigSchema,
    Music: MusicConfigSchema,
    ScriptGeneration: ScriptGenerationConfigSchema,
    Image: ImageConfigSchema,
    Video: VideoConfigSchema,
  })
  .default({
    General: GENERAL_DEFAULTS,
    Audio: AUDIO_DEFAULTS,
    Music: MUSIC_DEFAULTS,
    ScriptGeneration: SCRIPT_DEFAULTS,
    Image: IMAGE_DEFAULTS,
    Video: VIDEO_DEFAULTS,
  });

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function parseProjectConfig(raw: unknown): ProjectConfig {
  return ProjectConfigSchema.parse(raw);
}

export function createDefaultProjectConfig(): ProjectConfig {
  return ProjectConfigSchema.parse({
    General: GENERAL_DEFAULTS,
    Audio: AUDIO_DEFAULTS,
    Music: MUSIC_DEFAULTS,
    ScriptGeneration: SCRIPT_DEFAULTS,
    Image: IMAGE_DEFAULTS,
    Video: VIDEO_DEFAULTS,
  });
}
