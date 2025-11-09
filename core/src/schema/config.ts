import { z } from 'zod';

const LanguageEnum = z.enum(['en', 'de', 'es', 'fr', 'tr']);
const AspectRatioEnum = z.enum(['1:1', '3:2', '2:3', '4:3', '3:4', '16:9', '9:16', '21:9']);
const SizeEnum = z.enum(['480p', '720p', '1080p']);
const StyleEnum = z.enum(['Ghibli', 'Pixar', 'Anime', 'Watercolor', 'Cartoon', 'PhotoRealistic', 'Custom']);

const GENERAL_DEFAULTS = {
  audience: 'general',
  audiencePrompt: '',
  language: 'en',
  duration: 60,
  aspectRatio: '16:9',
  size: '480p',
  style: 'Ghibli',
  customStyle: '',
  voice: 'Atlas',
} as const;

const ProjectConfigOverrideSchema = z.object({
  audience: z.string().optional(),
  audiencePrompt: z.string().optional(),
  language: LanguageEnum.optional(),
  duration: z.number().positive().optional(),
  aspectRatio: AspectRatioEnum.optional(),
  size: SizeEnum.optional(),
  style: StyleEnum.optional(),
  customStyle: z.string().optional(),
  voice: z.string().optional(),
});

export const ProjectConfigSchema = ProjectConfigOverrideSchema.transform((value) => ({
  ...GENERAL_DEFAULTS,
  ...value,
}));

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

export function parseProjectConfig(raw: unknown): ProjectConfig {
  return ProjectConfigSchema.parse(raw);
}

export function parseProjectConfigPartial(raw: unknown): Partial<ProjectConfig> {
  return ProjectConfigOverrideSchema.parse(raw ?? {});
}

export function createDefaultProjectConfig(): ProjectConfig {
  return { ...GENERAL_DEFAULTS };
}
