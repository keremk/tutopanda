// Pure timeline assembly functions

import type {
  Timeline,
  TimelineTracks,
  KenBurnsClip,
  VideoClip,
  VisualClip,
  VoiceClip,
  MusicClip,
  ImageAsset,
  VideoAsset,
  NarrationSettings,
  MusicSettings,
} from "@/types/types";
import { selectKenBurnsEffect } from "./ken-burns";

const MIN_CLIP_DURATION = 1;

function ensurePositiveDuration(value?: number): number {
  if (typeof value !== "number") {
    return MIN_CLIP_DURATION;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : MIN_CLIP_DURATION;
}

export interface TimelineAssemblyInput {
  images: ImageAsset[];
  videos?: VideoAsset[];
  narration: NarrationSettings[];
  music: MusicSettings[];
  runId: string;
}

// Group images by segment index extracted from image ID
export function groupImagesBySegment(
  images: ImageAsset[]
): Map<number, ImageAsset[]> {
  const imagesBySegment = new Map<number, ImageAsset[]>();

  for (const image of images) {
    // Extract segment index from image ID (format: img-{runId}-{segmentIndex}-{imageIndex})
    const parts = image.id.split("-");
    const segmentIndex =
      parts.length >= 3 ? parseInt(parts[parts.length - 2], 10) : 0;

    if (!imagesBySegment.has(segmentIndex)) {
      imagesBySegment.set(segmentIndex, []);
    }
    imagesBySegment.get(segmentIndex)?.push(image);
  }

  return imagesBySegment;
}

// Group videos by segment index extracted from video ID
export function groupVideosBySegment(
  videos: VideoAsset[]
): Map<number, VideoAsset> {
  const videosBySegment = new Map<number, VideoAsset>();

  for (const video of videos) {
    // Extract segment index from video ID (format: video-{runId}-{segmentIndex})
    const parts = video.id.split("-");
    const segmentIndex =
      parts.length >= 3 ? parseInt(parts[parts.length - 1], 10) : 0;

    videosBySegment.set(segmentIndex, video);
  }

  return videosBySegment;
}

// Build visual track with videos or Ken Burns effects
export function buildVisualTrack(
  imagesBySegment: Map<number, ImageAsset[]>,
  videosBySegment: Map<number, VideoAsset>,
  narration: NarrationSettings[],
  segmentDurations: number[]
): VisualClip[] {
  const visualTrack: VisualClip[] = [];
  let accumulatedTime = 0;
  let previousEffectName: string | undefined;

  for (let segmentIndex = 0; segmentIndex < narration.length; segmentIndex++) {
    const narrationDuration =
      segmentDurations[segmentIndex] ?? ensurePositiveDuration();
    const video = videosBySegment.get(segmentIndex);
    const videoIsGenerated =
      !!(video && (video.status === undefined || video.status === "generated") && video.videoPath);

    if (video && videoIsGenerated) {
      const clip: VideoClip = {
        id: `visual-${segmentIndex}`,
        name: `Segment ${segmentIndex + 1} Video`,
        kind: "video",
        videoAssetId: video.id,
        startTime: accumulatedTime,
        duration: narrationDuration,
        volume: 0,
        status: video.status,
        error: video.error,
      };
      accumulatedTime += narrationDuration;
      visualTrack.push(clip);
    } else {
      const segmentImages = imagesBySegment.get(segmentIndex) || [];
      const generatedImages = segmentImages.filter(
        (image) => image.status === undefined || image.status === "generated"
      );

      if (generatedImages.length > 0) {
        const imageDuration = narrationDuration / generatedImages.length;

        for (let imageIndex = 0; imageIndex < generatedImages.length; imageIndex++) {
          const image = generatedImages[imageIndex];
          const selectedEffect = selectKenBurnsEffect(image.prompt, previousEffectName);
          previousEffectName = selectedEffect.name;

          const clip: KenBurnsClip = {
            id: `visual-${segmentIndex}-${imageIndex}`,
            name: `Segment ${segmentIndex + 1}${generatedImages.length > 1 ? ` Image ${imageIndex + 1}` : ""}`,
            kind: "kenBurns",
            effectName: selectedEffect.name,
            imageAssetId: image.id,
            startTime: accumulatedTime,
            duration: imageDuration,
            startScale: selectedEffect.startScale,
            endScale: selectedEffect.endScale,
            startX: selectedEffect.startX,
            startY: selectedEffect.startY,
            endX: selectedEffect.endX,
            endY: selectedEffect.endY,
            status: image.status,
            error: image.error,
          };

          accumulatedTime += imageDuration;
          visualTrack.push(clip);
        }
      } else {
        const failureSource = video ?? segmentImages[0];
        const status = failureSource?.status ?? "failed";
        const error = failureSource?.error;
        const prompt =
          failureSource && "prompt" in failureSource
            ? ((failureSource as ImageAsset).prompt ?? "")
            : "";

        const selectedEffect = selectKenBurnsEffect(prompt, previousEffectName);
        previousEffectName = selectedEffect.name;

        const placeholderClip: KenBurnsClip = {
          id: `visual-${segmentIndex}-placeholder`,
          name: `Segment ${segmentIndex + 1} Placeholder`,
          kind: "kenBurns",
          effectName: selectedEffect.name,
          startTime: accumulatedTime,
          duration: narrationDuration,
          startScale: selectedEffect.startScale,
          endScale: selectedEffect.endScale,
          startX: selectedEffect.startX,
          startY: selectedEffect.startY,
          endX: selectedEffect.endX,
          endY: selectedEffect.endY,
          status,
          error,
        };

        accumulatedTime += narrationDuration;
        visualTrack.push(placeholderClip);
      }

      if (generatedImages.length > 0) {
        // accumulatedTime already updated inside loop
      }
    }
  }

  return visualTrack;
}

// Build voice track from narration assets
export function buildVoiceTrack(
  narration: NarrationSettings[],
  segmentDurations: number[]
): VoiceClip[] {
  let accumulatedTime = 0;

  return narration.map((narrationAsset, index) => {
    const duration = segmentDurations[index] ?? ensurePositiveDuration();
    const clip: VoiceClip = {
      id: `voice-${index}`,
      name: `Narration ${index + 1}`,
      kind: "voice",
      narrationAssetId: narrationAsset.id,
      startTime: accumulatedTime,
      duration,
      volume: 1.0,
      status: narrationAsset.status,
      error: narrationAsset.error,
    };
    accumulatedTime += duration;
    return clip;
  });
}

// Build music track from music assets
export function buildMusicTrack(
  music: MusicSettings[],
  totalDuration: number,
  runId: string
): MusicClip[] {
  return music.map((musicAsset) => ({
    id: `music-${runId}`,
    name: "Background Score",
    kind: "music",
    musicAssetId: musicAsset.id,
    startTime: 0,
    duration: totalDuration,
    volume: 0.3,
    fadeInDuration: 2,
    fadeOutDuration: 3,
    status: musicAsset.status,
    error: musicAsset.error,
  }));
}

// Calculate total duration from narration
export function calculateTotalDuration(
  segmentDurations: number[]
): number {
  return segmentDurations.reduce((sum, duration) => sum + duration, 0);
}

// Main timeline assembly function
export function assembleTimeline(
  input: TimelineAssemblyInput
): Timeline {
  const { images, videos = [], narration, music, runId } = input;

  // Validate inputs
  if (images.length === 0 && videos.length === 0) {
    throw new Error("No images or videos available for timeline");
  }

  if (narration.length === 0) {
    throw new Error("No narration available for timeline");
  }

  const segmentDurations = narration.map((segment) =>
    ensurePositiveDuration(segment.duration)
  );

  // Calculate total duration
  const totalDuration = calculateTotalDuration(segmentDurations);

  // Group images and videos by segment
  const imagesBySegment = groupImagesBySegment(images);
  const videosBySegment = groupVideosBySegment(videos);

  // Build all tracks
  const visualTrack = buildVisualTrack(
    imagesBySegment,
    videosBySegment,
    narration,
    segmentDurations
  );
  const voiceTrack = buildVoiceTrack(narration, segmentDurations);
  const musicTrack = buildMusicTrack(music, totalDuration, runId);

  const tracks: TimelineTracks = {
    visual: visualTrack,
    voice: voiceTrack,
    music: musicTrack,
    soundEffects: [],
  };

  return {
    id: `timeline-${runId}`,
    name: "Timeline",
    duration: totalDuration,
    tracks,
  };
}
