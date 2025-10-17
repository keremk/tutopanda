import type { LectureScript, VideoConfig as VideoConfigType } from "@/types/types";
import type { MediaProvider } from "../core";

type LectureSegment = LectureScript["segments"][number];

export type VideoGenerationInput = {
  segment: LectureSegment;
  lectureSummary: string;
  segmentIndex: number;
  videoConfig: VideoConfigType;
  runId: string;
};

export type VideoConfig = {
  aspectRatio?: string;
  resolution?: string;
  duration?: string;
  model?: string;
};

export type VideoGenerationParams = {
  prompt: string;
  startingImage: Buffer;
  aspectRatio: string;
  resolution: string;
  duration: number; // in seconds
  model?: string;
};

export interface VideoProvider extends MediaProvider {
  generateVideo(params: VideoGenerationParams): Promise<string | Buffer>;
}

export type VideoPromptGenerationResult = {
  segmentStartImagePrompt: string;
  movieDirections: string;
};
