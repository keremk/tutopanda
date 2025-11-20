import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame } from "remotion";
import type { VideoClip } from "@/types/timeline";
import { buildAssetUrl } from "@/data/client";

interface VideoClipSequenceProps {
  clip: VideoClip;
  movieId: string;
  fps: number;
  from: number;
  durationInFrames: number;
  premountFor: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

export const VideoClipSequence = ({
  clip,
  movieId,
  fps,
  from,
  durationInFrames,
  premountFor,
}: VideoClipSequenceProps) => {
  const assetId = clip.properties.assetId;
  if (!assetId) {
    return null;
  }

  const sourceUrl = `${buildAssetUrl(movieId, assetId)}#disable`;
  const fitStrategy = clip.properties.fitStrategy ?? "stretch";
  const volume = typeof clip.properties.volume === "number" ? clip.properties.volume : 0;
  const originalDuration = clip.properties.originalDuration ?? clip.duration;
  const originalFrames = Math.max(1, Math.round(originalDuration * fps));
  const playbackRate =
    fitStrategy === "stretch" && clip.duration > 0 && originalDuration > 0
      ? originalDuration / clip.duration
      : 1;
  const localFrame = clamp(useCurrentFrame() - from, 0, durationInFrames);

  return (
    <Sequence from={from} durationInFrames={durationInFrames} premountFor={premountFor}>
      <AbsoluteFill>
        {renderVideoContent({
          sourceUrl,
          volume,
          playbackRate,
          fitStrategy,
          durationInFrames,
        })}
        {fitStrategy === "freeze-fade" ? (
          <FreezeFadeOverlay
            localFrame={localFrame}
            durationInFrames={durationInFrames}
            originalFrames={originalFrames}
          />
        ) : null}
      </AbsoluteFill>
    </Sequence>
  );
};

function renderVideoContent(args: {
  sourceUrl: string;
  volume: number;
  playbackRate: number;
  fitStrategy: string;
  durationInFrames: number;
}) {
  const { sourceUrl, volume, playbackRate, fitStrategy } = args;

  if (fitStrategy === "stretch") {
    return (
      <OffthreadVideo
        src={sourceUrl}
        muted={volume === 0}
        volume={volume}
        playbackRate={playbackRate}
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    );
  }

  return (
    <OffthreadVideo
      src={sourceUrl}
      muted={volume === 0}
      volume={volume}
      playbackRate={1}
      startFrom={0}
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
    />
  );
}

function FreezeFadeOverlay({
  localFrame,
  durationInFrames,
  originalFrames,
}: {
  localFrame: number;
  durationInFrames: number;
  originalFrames: number;
}) {
  if (durationInFrames === originalFrames) {
    return null;
  }

  if (originalFrames < durationInFrames) {
    const freezeStart = originalFrames;
    const fadeFrames = Math.max(1, durationInFrames - originalFrames);
    const progress = clamp((localFrame - freezeStart) / fadeFrames, 0, 1);
    if (progress <= 0) {
      return null;
    }
    return (
      <AbsoluteFill
        style={{
          backgroundColor: "black",
          opacity: progress,
        }}
      />
    );
  }

  const fadeFrames = Math.max(1, Math.min(originalFrames - durationInFrames, durationInFrames));
  const fadeStart = Math.max(0, durationInFrames - fadeFrames);
  const progress = clamp((localFrame - fadeStart) / fadeFrames, 0, 1);
  if (progress <= 0) {
    return null;
  }

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "black",
        opacity: progress,
      }}
    />
  );
}
