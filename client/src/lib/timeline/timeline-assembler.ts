// Pure timeline assembly functions

import type {
  Timeline,
  TimelineTracks,
  KenBurnsClip,
  VoiceClip,
  MusicClip,
  ImageAsset,
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

// Build visual track with Ken Burns effects
export function buildVisualTrack(
  imagesBySegment: Map<number, ImageAsset[]>,
  narration: NarrationSettings[],
  segmentDurations: number[]
): KenBurnsClip[] {
  const visualTrack: KenBurnsClip[] = [];
  let accumulatedTime = 0;
  let previousEffectName: string | undefined;

  for (let segmentIndex = 0; segmentIndex < narration.length; segmentIndex++) {
    const segmentImages = imagesBySegment.get(segmentIndex) || [];
    const narrationDuration =
      segmentDurations[segmentIndex] ?? ensurePositiveDuration();
    const imageDuration =
      segmentImages.length > 0
        ? narrationDuration / segmentImages.length
        : narrationDuration;

    for (let imageIndex = 0; imageIndex < segmentImages.length; imageIndex++) {
      const image = segmentImages[imageIndex];

      // Select intelligent Ken Burns effect based on image content
      const selectedEffect = selectKenBurnsEffect(
        image.prompt,
        previousEffectName
      );
      previousEffectName = selectedEffect.name;

      const clip: KenBurnsClip = {
        id: `visual-${segmentIndex}-${imageIndex}`,
        name: `Segment ${segmentIndex + 1}${segmentImages.length > 1 ? ` Image ${imageIndex + 1}` : ""}`,
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
      };

      accumulatedTime += imageDuration;
      visualTrack.push(clip);
    }

    if (segmentImages.length === 0) {
      accumulatedTime += narrationDuration;
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
  const { images, narration, music, runId } = input;

  // Validate inputs
  if (images.length === 0) {
    throw new Error("No images available for timeline");
  }

  if (narration.length === 0) {
    throw new Error("No narration available for timeline");
  }

  const segmentDurations = narration.map((segment) =>
    ensurePositiveDuration(segment.duration)
  );

  // Calculate total duration
  const totalDuration = calculateTotalDuration(segmentDurations);

  // Group images by segment
  const imagesBySegment = groupImagesBySegment(images);

  // Build all tracks
  const visualTrack = buildVisualTrack(
    imagesBySegment,
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
