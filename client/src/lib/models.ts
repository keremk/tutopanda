/**
 * Central registry for all AI model names and configurations.
 *
 * This file is the single source of truth for model identifiers.
 * DO NOT hardcode model names anywhere else in the codebase.
 */

// ============================================================================
// IMAGE GENERATION MODELS
// ============================================================================

export const IMAGE_MODELS = {
  BYTEDANCE_SEEDREAM_4: "bytedance/seedream-4",
  GOOGLE_NANO_BANANA: "google/nano-banana",
  QWEN_IMAGE: "qwen/qwen-image",
} as const;

export const imageModelValues = [
  IMAGE_MODELS.BYTEDANCE_SEEDREAM_4,
  IMAGE_MODELS.GOOGLE_NANO_BANANA,
  IMAGE_MODELS.QWEN_IMAGE,
] ;

export const imageModelOptions = [
  { id: IMAGE_MODELS.BYTEDANCE_SEEDREAM_4, name: "Bytedance Seedream 4" },
  { id: IMAGE_MODELS.GOOGLE_NANO_BANANA, name: "Google Nano Banana" },
  { id: IMAGE_MODELS.QWEN_IMAGE, name: "Qwen Image" },
] as const;

export const DEFAULT_IMAGE_MODEL = IMAGE_MODELS.BYTEDANCE_SEEDREAM_4;

// ============================================================================
// NARRATION/TTS MODELS
// ============================================================================

export const NARRATION_MODELS = {
  MINIMAX_SPEECH_02_HD: "minimax/speech-02-hd",
  ELEVEN_V3: "elevenlabs/eleven-monolingual-v3",
} as const;

export const DEFAULT_NARRATION_MODEL = NARRATION_MODELS.MINIMAX_SPEECH_02_HD;

export type NarrationVoiceOption = {
  id: string;
  label: string;
  description?: string;
  languages: readonly string[];
};

export type NarrationLanguageSettings = {
  language?: string;
  languageBoost?: string;
  englishNormalization?: boolean;
};

export const MINIMAX_VOICES = {
  MALE_ENGLISH_STORYTELLER: "English_CaptivatingStoryteller",
  MALE_ENGLISH_DEEP_VOICED: "English_Deep-VoicedGentleman",
  MALE_ENGLISH_WISE_SCHOLAR: "English_WiseScholar",
  FEMALE_ENGLISH_WISE_SCHOLAR: "English_Wiselady",
  FEMALE_ENGLISH_GRACEFUL: "English_Graceful_Lady",
  MALE_SPANISH_MENTOR: "Spanish_Steadymentor",
  FEMALE_SPANISH_THOUGHTFUL: "Spanish_ThoughtfulLady",
  FEMALE_FRENCH_NARRATOR: "French_MaleNarrator",
  FEMALE_FRENCH_NEWS_ANCHOR: "French_Female_News Anchor",
  MALE_TURKISH_NARRATOR: "Turkish_Trustworthyman",
  MALE_GERMAN_FRIENDLY: "German_FriendlyMan",
} as const;

export type MinimaxVoiceType = typeof MINIMAX_VOICES[keyof typeof MINIMAX_VOICES];

const MINIMAX_LANGUAGES = ["en", "es", "fr", "de", "tr"] as const;
type MinimaxLanguage = typeof MINIMAX_LANGUAGES[number];

type MinimaxVoiceOption = NarrationVoiceOption & { languages: ReadonlyArray<MinimaxLanguage> };

const MINIMAX_VOICE_CATALOG: readonly MinimaxVoiceOption[] = [
  {
    id: MINIMAX_VOICES.MALE_ENGLISH_STORYTELLER,
    label: "Atlas — Captivating English storyteller",
    description: "Warm, engaging pacing that keeps educational and narrative scripts approachable.",
    languages: ["en"],
  },
  {
    id: MINIMAX_VOICES.MALE_ENGLISH_DEEP_VOICED,
    label: "Bennett — Deep-voiced English gentleman",
    description: "Rich baritone delivery suited to authoritative explainers and inspirational pieces.",
    languages: ["en"],
  },
  {
    id: MINIMAX_VOICES.MALE_ENGLISH_WISE_SCHOLAR,
    label: "Rowan — Reflective English scholar",
    description: "Measured cadence with subtle gravitas, ideal for concept walkthroughs and summaries.",
    languages: ["en"],
  },
  {
    id: MINIMAX_VOICES.FEMALE_ENGLISH_WISE_SCHOLAR,
    label: "Clara — Insightful English scholar",
    description: "Clear, confident guidance that balances approachability with expertise.",
    languages: ["en"],
  },
  {
    id: MINIMAX_VOICES.FEMALE_ENGLISH_GRACEFUL,
    label: "Evelyn — Graceful English presenter",
    description: "Polished broadcast tone perfect for introductions, transitions, and premium content.",
    languages: ["en"],
  },
  {
    id: MINIMAX_VOICES.MALE_SPANISH_MENTOR,
    label: "Mateo — Steady Spanish mentor",
    description: "Supportive, encouraging style that works well for instructional Spanish materials.",
    languages: ["es"],
  },
  {
    id: MINIMAX_VOICES.FEMALE_SPANISH_THOUGHTFUL,
    label: "Lucia — Thoughtful Spanish narrator",
    description: "Gentle emphasis and smooth pacing for storytelling or reflective explainers.",
    languages: ["es"],
  },
  {
    id: MINIMAX_VOICES.FEMALE_FRENCH_NARRATOR,
    label: "Camille — Expressive French narrator",
    description: "Articulate narration with just enough flair for immersive French content.",
    languages: ["fr"],
  },
  {
    id: MINIMAX_VOICES.FEMALE_FRENCH_NEWS_ANCHOR,
    label: "Elodie — French news anchor",
    description: "Crisp and professional delivery tailored to concise updates and announcements.",
    languages: ["fr"],
  },
  {
    id: MINIMAX_VOICES.MALE_TURKISH_NARRATOR,
    label: "Kemal — Trustworthy Turkish narrator",
    description: "Steady, reassuring tone that suits guidance, onboarding, and educational scripts.",
    languages: ["tr"],
  },
  {
    id: MINIMAX_VOICES.MALE_GERMAN_FRIENDLY,
    label: "Felix — Friendly German narrator",
    description: "Bright and inviting voice for approachable German explainers and tutorials.",
    languages: ["de"],
  },
] as const;

const MINIMAX_DEFAULT_LANGUAGE: MinimaxLanguage = "en";

export const minimaxVoiceOptions = MINIMAX_VOICE_CATALOG;

export function getMinimaxVoiceOptionsForLanguage(language: string | undefined): readonly NarrationVoiceOption[] {
  if (!language) {
    return minimaxVoiceOptions;
  }

  const normalizedLanguage = language.toLowerCase();
  const supportedLanguage =
    (MINIMAX_LANGUAGES.find((code) => code === normalizedLanguage) ?? MINIMAX_DEFAULT_LANGUAGE) as MinimaxLanguage;

  const filtered = minimaxVoiceOptions.filter((voice) => voice.languages.includes(supportedLanguage));
  return filtered.length > 0
    ? filtered
    : minimaxVoiceOptions.filter((voice) => voice.languages.includes(MINIMAX_DEFAULT_LANGUAGE));
}

const MINIMAX_LANGUAGE_CONFIG: Record<MinimaxLanguage, { languageBoost: string; englishNormalization: boolean }> = {
  en: { languageBoost: "English", englishNormalization: true },
  es: { languageBoost: "Spanish", englishNormalization: false },
  fr: { languageBoost: "French", englishNormalization: false },
  de: { languageBoost: "German", englishNormalization: false },
  tr: { languageBoost: "Turkish", englishNormalization: false },
};

export function getMinimaxLanguageSettings(language: string | undefined): NarrationLanguageSettings {
  const normalizedLanguage = language?.toLowerCase();
  const matchedLanguage =
    MINIMAX_LANGUAGES.find((code) => code === normalizedLanguage) ?? MINIMAX_DEFAULT_LANGUAGE;

  return {
    language: matchedLanguage,
    languageBoost: MINIMAX_LANGUAGE_CONFIG[matchedLanguage].languageBoost,
    englishNormalization: MINIMAX_LANGUAGE_CONFIG[matchedLanguage].englishNormalization,
  };
}

type PresetVoiceSelection = {
  type: "preset";
  label: string;
  defaultVoiceId: string;
  options: readonly NarrationVoiceOption[];
  getOptionsForLanguage?: (language?: string) => readonly NarrationVoiceOption[];
  getLanguageSettings?: (language?: string) => NarrationLanguageSettings;
};

type CustomVoiceSelection = {
  type: "custom";
  label: string;
  placeholder?: string;
  helperText?: string;
};

export type NarrationModelDefinition = {
  id: NarrationModelType;
  name: string;
  provider: "minimax" | "elevenlabs";
  supportsEmotion: boolean;
  voiceSelection: PresetVoiceSelection | CustomVoiceSelection;
};

const NARRATION_MODEL_DEFINITIONS: Record<NarrationModelType, NarrationModelDefinition> = {
  [NARRATION_MODELS.MINIMAX_SPEECH_02_HD]: {
    id: NARRATION_MODELS.MINIMAX_SPEECH_02_HD,
    name: "MiniMax Speech HD",
    provider: "minimax",
    supportsEmotion: true,
    voiceSelection: {
      type: "preset",
      label: "Voice",
      defaultVoiceId: MINIMAX_VOICES.MALE_ENGLISH_STORYTELLER,
      options: minimaxVoiceOptions,
      getOptionsForLanguage: getMinimaxVoiceOptionsForLanguage,
      getLanguageSettings: getMinimaxLanguageSettings,
    },
  },
  [NARRATION_MODELS.ELEVEN_V3]: {
    id: NARRATION_MODELS.ELEVEN_V3,
    name: "ElevenLabs V3",
    provider: "elevenlabs",
    supportsEmotion: false,
    voiceSelection: {
      type: "custom",
      label: "Voice ID",
      placeholder: "Enter an ElevenLabs voice ID",
      helperText: "Copy the voice ID from your ElevenLabs dashboard or presets.",
    },
  },
};

export const narrationModelOptions: ReadonlyArray<{
  id: NarrationModelType;
  name: string;
  supportsEmotion: boolean;
}> = Object.values(NARRATION_MODEL_DEFINITIONS).map((definition) => ({
  id: definition.id,
  name: definition.name,
  supportsEmotion: definition.supportsEmotion,
}));

export function getNarrationModelDefinition(modelId: string | null | undefined): NarrationModelDefinition | undefined {
  if (!modelId) {
    return undefined;
  }

  if (!(modelId in NARRATION_MODEL_DEFINITIONS)) {
    return undefined;
  }

  return NARRATION_MODEL_DEFINITIONS[modelId as NarrationModelType];
}

export function getVoiceOptionsForNarrationModel(
  modelId: string | null | undefined,
  language?: string
): readonly NarrationVoiceOption[] {
  const definition = getNarrationModelDefinition(modelId);
  if (!definition) {
    return [];
  }

  const selection = definition.voiceSelection;
  if (selection.type !== "preset") {
    return [];
  }

  return selection.getOptionsForLanguage?.(language) ?? selection.options;
}

export function getDefaultVoiceForNarrationModel(modelId: string | null | undefined): string | undefined {
  const definition = getNarrationModelDefinition(modelId);
  if (!definition) {
    return undefined;
  }

  const selection = definition.voiceSelection;
  return selection.type === "preset" ? selection.defaultVoiceId : undefined;
}

export function getNarrationLanguageSettings(
  modelId: string | null | undefined,
  language?: string
): NarrationLanguageSettings {
  const definition = getNarrationModelDefinition(modelId);
  if (!definition) {
    return language ? { language } : {};
  }

  const selection = definition.voiceSelection;
  if (selection.type !== "preset" || !selection.getLanguageSettings) {
    return language ? { language } : {};
  }

  return selection.getLanguageSettings(language);
}

export function isMiniMaxModel(model: string): boolean {
  return getNarrationModelDefinition(model)?.provider === "minimax";
}

// ============================================================================
// MUSIC GENERATION MODELS
// ============================================================================

export const MUSIC_MODELS = {
  STABILITY_STABLE_AUDIO_2_5: "stability-ai/stable-audio-2.5",
  ELEVENLABS: "ElevenLabs",
} as const;

// Legacy model names that need migration
export const LEGACY_MUSIC_MODELS = {
  STABLE_AUDIO_OLD: "Stable Audio",
} as const;

export const musicModelValues = [
  MUSIC_MODELS.STABILITY_STABLE_AUDIO_2_5,
  MUSIC_MODELS.ELEVENLABS,
] as const;

export const musicModelOptions = [
  { id: MUSIC_MODELS.STABILITY_STABLE_AUDIO_2_5, name: "Stable Audio 2.5" },
  { id: MUSIC_MODELS.ELEVENLABS, name: "ElevenLabs" },
] as const;

export const DEFAULT_MUSIC_MODEL = MUSIC_MODELS.STABILITY_STABLE_AUDIO_2_5;

/**
 * Migrates legacy music model names to current identifiers
 */
export function migrateMusicModel(modelName: string): string {
  if (modelName === LEGACY_MUSIC_MODELS.STABLE_AUDIO_OLD) {
    return MUSIC_MODELS.STABILITY_STABLE_AUDIO_2_5;
  }
  return modelName;
}

// ============================================================================
// SOUND EFFECT MODELS
// ============================================================================

export const SOUND_EFFECT_MODELS = {
  DECLARE_LAB_TANGO: "Declare Lab Tango",
  ELEVENLABS: "ElevenLabs",
} as const;

export const soundEffectModelValues = [
  SOUND_EFFECT_MODELS.DECLARE_LAB_TANGO,
  SOUND_EFFECT_MODELS.ELEVENLABS,
] as const;

export const soundEffectModelOptions = [
  { id: SOUND_EFFECT_MODELS.DECLARE_LAB_TANGO, name: "Declare Lab Tango" },
  { id: SOUND_EFFECT_MODELS.ELEVENLABS, name: "ElevenLabs" },
] as const;

export const DEFAULT_SOUND_EFFECT_MODEL = SOUND_EFFECT_MODELS.ELEVENLABS;

// ============================================================================
// VIDEO GENERATION MODELS
// ============================================================================

export const VIDEO_MODELS = {
  BYTEDANCE_SEEDANCE_1_LITE: "bytedance/seedance-1-lite",
} as const;

export const videoModelValues = [
  VIDEO_MODELS.BYTEDANCE_SEEDANCE_1_LITE,
] as const;

export const videoModelOptions = [
  { id: VIDEO_MODELS.BYTEDANCE_SEEDANCE_1_LITE, name: "Seadance 1 Lite" },
] as const;

export const DEFAULT_VIDEO_MODEL = VIDEO_MODELS.BYTEDANCE_SEEDANCE_1_LITE;

// ============================================================================
// LLM MODELS (Script Generation)
// ============================================================================

export const LLM_MODELS = {
  GPT_5: "gpt-5",
  GPT_5_MINI: "gpt-5-mini",
  GPT_4O: "gpt-4o",
  GPT_4O_MINI: "gpt-4o-mini",
} as const;

export const llmModelOptions = [
  { id: LLM_MODELS.GPT_5, name: "GPT-5" },
  { id: LLM_MODELS.GPT_5_MINI, name: "GPT-5 Mini" },
  { id: LLM_MODELS.GPT_4O, name: "GPT-4o" },
  { id: LLM_MODELS.GPT_4O_MINI, name: "GPT-4o Mini" },
] as const;

export const DEFAULT_SCRIPT_MODEL = LLM_MODELS.GPT_5;

// ============================================================================
// DEFAULT VOICE CONFIGURATION
// ============================================================================

const DEFAULT_MINIMAX_VOICE = getDefaultVoiceForNarrationModel(DEFAULT_NARRATION_MODEL) ?? MINIMAX_VOICES.MALE_ENGLISH_STORYTELLER;

// These can be overridden by environment variables
export const DEFAULT_VOICE_ID = process.env.DEFAULT_VOICE_ID || DEFAULT_MINIMAX_VOICE;
export const DEFAULT_VOICE_MODEL_ID = process.env.DEFAULT_VOICE_MODEL_ID || DEFAULT_NARRATION_MODEL;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ImageModelType = typeof imageModelValues[number];
export type MusicModelType = typeof musicModelValues[number];
export type SoundEffectModelType = typeof soundEffectModelValues[number];
export type VideoModelType = typeof videoModelValues[number];
export type NarrationModelType = typeof NARRATION_MODELS[keyof typeof NARRATION_MODELS];
