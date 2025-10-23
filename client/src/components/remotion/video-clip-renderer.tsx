import {
  Sequence,
  OffthreadVideo,
  Img,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { VideoClip } from "@/types/types";

interface VideoClipRendererProps {
  clip: VideoClip;
  videoUrl: string;
}

export const VideoClipRenderer: React.FC<VideoClipRendererProps> = ({
  clip,
  videoUrl,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const startFrame = Math.round(clip.startTime * fps);
  const durationInFrames = Math.round(clip.duration * fps);

  // Disable media fragment hints (required for frame-accurate seeking)
  const videoUrlWithDisable = `${videoUrl}#disable`;

  // Case 1: Speed Adjustment
  if (clip.speedAdjustment && clip.speedAdjustment !== 1) {
    return (
      <Sequence key={clip.id} from={startFrame} durationInFrames={durationInFrames}>
        <OffthreadVideo
          src={videoUrlWithDisable}
          startFrom={0}
          playbackRate={clip.speedAdjustment}
          muted={true}
          volume={clip.volume ?? 0}
          style={{ width: "100%", height: "100%" }}
        />
      </Sequence>
    );
  }

  // Case 2: Freeze-Fade Transition
  if (
    clip.transitionType === "freeze-fade" &&
    clip.originalDuration &&
    clip.transitionDuration
  ) {
    const originalDurationFrames = Math.round(clip.originalDuration * fps);
    const localFrame = frame - startFrame;

    return (
      <Sequence key={clip.id} from={startFrame} durationInFrames={durationInFrames}>
        {/* Video plays to end and freezes on last frame automatically */}
        <OffthreadVideo
          src={videoUrlWithDisable}
          startFrom={0}
          muted={true}
          volume={clip.volume ?? 0}
          style={{ width: "100%", height: "100%" }}
        />

        {/* Black overlay fades in after video ends */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: '#000',
            opacity: interpolate(
              localFrame,
              [originalDurationFrames, durationInFrames],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            ),
          }}
        />
      </Sequence>
    );
  }

  // Case 3: Crossfade (defer to future)
  if (clip.transitionType === "crossfade") {
    console.warn(`Crossfade transition not yet implemented for clip ${clip.id}`);
    // Fall through to normal rendering
  }

  // Case 4: Normal rendering (no adjustment)
  return (
    <Sequence key={clip.id} from={startFrame} durationInFrames={durationInFrames}>
      <OffthreadVideo
        src={videoUrlWithDisable}
        startFrom={0}
        muted={true}
        volume={clip.volume ?? 0}
        style={{ width: "100%", height: "100%" }}
      />
    </Sequence>
  );
};
