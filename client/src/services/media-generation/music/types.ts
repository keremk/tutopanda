import type { LectureScript, MusicSettings } from "@/types/types";
import type { MediaProvider } from "../core";

/**
 * Input for generating music for a lecture
 */
export type MusicGenerationInput = {
  script: LectureScript;
  durationSeconds: number;
  model?: string;
  id: string;
  label?: string;
};

/**
 * Configuration for music generation (pure function input)
 */
export type MusicConfig = {
  durationSeconds: number;
  model?: string;
};

/**
 * Parameters for music generation API calls
 */
export type MusicGenerationParams = {
  prompt: string;
  durationSeconds: number;
  model?: string;
};

/**
 * Provider interface for music generation
 */
export interface MusicProvider extends MediaProvider {
  /**
   * Generate music from a prompt and return the audio buffer
   */
  generateMusic(params: MusicGenerationParams): Promise<Buffer>;
}
