import type { LectureScript, ImageGenerationDefaults } from "@/types/types";
import type { MediaProvider } from "../core";

type LectureSegment = LectureScript["segments"][number];

/**
 * Input for generating image(s) for a single segment
 */
export type ImageGenerationInput = {
  segment: LectureSegment;
  segmentIndex: number;
  imageDefaults: ImageGenerationDefaults;
  runId: string;
  model?: string;
};

/**
 * Configuration for image generation (pure function input)
 */
export type ImageConfig = {
  aspectRatio?: string;
  size?: string;
  width?: number;
  height?: number;
  model?: string;
};

/**
 * Parameters for image generation API calls
 */
export type ImageGenerationParams = {
  prompt: string;
  aspectRatio: string;
  size: string;
  width: number;
  height: number;
  model?: string;
};

/**
 * Provider interface for image generation
 */
export interface ImageProvider extends MediaProvider {
  /**
   * Generate an image from a prompt and return the URL or buffer
   */
  generateImage(params: ImageGenerationParams): Promise<string | Buffer>;
}

/**
 * Options for prompt generation
 */
export type PromptGenerationOptions = {
  segment: LectureSegment;
  segmentIndex: number;
  imagesPerSegment: number;
};
