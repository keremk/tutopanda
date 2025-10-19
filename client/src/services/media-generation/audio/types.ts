import type { NarrationSettings } from "@/types/types";
import type { MediaProvider, MediaGenerationError } from "../core";

/**
 * Input for generating audio for a single narration
 */
export type AudioGenerationInput = {
  text: string;
  voice: string;
  model: string;
  id: string;
  label?: string;
};

/**
 * Configuration for audio generation (pure function input)
 */
export type AudioConfig = {
  voice: string;
  model?: string;
  emotion?: string;
  languageBoost?: string;
  englishNormalization?: boolean;
};

/**
 * Parameters for audio generation API calls
 */
export type AudioGenerationParams = {
  text: string;
  voiceId: string;
  modelId: string;
  emotion?: string;
  languageBoost?: string;
  englishNormalization?: boolean;
};

/**
 * Audio generation result with duration metadata
 */
export type AudioGenerationResult = {
  buffer: Buffer;
  duration: number;
};

export type AudioGenerationSuccess = {
  ok: true;
  audio: AudioGenerationResult;
};

export type AudioGenerationFailure = {
  ok: false;
  error: MediaGenerationError;
};

export type AudioGenerationOutcome = AudioGenerationSuccess | AudioGenerationFailure;

/**
 * Provider interface for audio/TTS generation
 */
export interface AudioProvider extends MediaProvider {
  /**
   * Generate audio from text and return the audio buffer with duration
   */
  generateAudio(params: AudioGenerationParams): Promise<AudioGenerationResult>;
}
