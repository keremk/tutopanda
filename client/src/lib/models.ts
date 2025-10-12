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
] as const;

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
  ELEVEN_V3: "eleven_v3",
  DEEPGRAM_AURA_ASTERIA: "aura-asteria-en",
} as const;

export const DEFAULT_NARRATION_MODEL = NARRATION_MODELS.MINIMAX_SPEECH_02_HD;

// MiniMax voice IDs
export const MINIMAX_VOICES = {
  MALE_QN_QINGSE: "male-qn-qingse",
  FEMALE_SHAONV: "female-shaonv",
  FEMALE_YUJIE: "female-yujie",
  MALE_QINGSE_JINGPIN: "male-qingse-jingpin",
  FEMALE_SHAONV_JINGPIN: "female-shaonv-jingpin",
} as const;

export const minimaxVoiceOptions = [
  { id: MINIMAX_VOICES.MALE_QN_QINGSE, name: "Male - Qingse" },
  { id: MINIMAX_VOICES.FEMALE_SHAONV, name: "Female - Shaonv" },
  { id: MINIMAX_VOICES.FEMALE_YUJIE, name: "Female - Yujie" },
  { id: MINIMAX_VOICES.MALE_QINGSE_JINGPIN, name: "Male - Qingse Jingpin" },
  { id: MINIMAX_VOICES.FEMALE_SHAONV_JINGPIN, name: "Female - Shaonv Jingpin" },
] as const;

export const narrationModelOptions = [
  {
    id: NARRATION_MODELS.MINIMAX_SPEECH_02_HD,
    name: "MiniMax Speech HD",
    supportsEmotion: true
  },
  {
    id: NARRATION_MODELS.ELEVEN_V3,
    name: "ElevenLabs V3",
    supportsEmotion: false
  },
] as const;

// Helper function to check if a model is MiniMax
export function isMiniMaxModel(model: string): boolean {
  return model === NARRATION_MODELS.MINIMAX_SPEECH_02_HD;
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
  SEADANCE_1_LITE: "Seadance-1-lite",
} as const;

export const videoModelValues = [
  VIDEO_MODELS.SEADANCE_1_LITE,
] as const;

export const DEFAULT_VIDEO_MODEL = VIDEO_MODELS.SEADANCE_1_LITE;

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

// These can be overridden by environment variables
export const DEFAULT_VOICE_ID = process.env.DEFAULT_VOICE_ID || "onwK4e9ZLuTAKqWW03F9";
export const DEFAULT_VOICE_MODEL_ID = process.env.DEFAULT_VOICE_MODEL_ID || NARRATION_MODELS.ELEVEN_V3;

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type ImageModelType = typeof imageModelValues[number];
export type MusicModelType = typeof musicModelValues[number];
export type SoundEffectModelType = typeof soundEffectModelValues[number];
export type VideoModelType = typeof videoModelValues[number];
export type NarrationModelType = typeof NARRATION_MODELS[keyof typeof NARRATION_MODELS];
export type MinimaxVoiceType = typeof MINIMAX_VOICES[keyof typeof MINIMAX_VOICES];
