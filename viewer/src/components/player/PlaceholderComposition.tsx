import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { Timeline } from "@/types/timeline";

interface PlaceholderCompositionProps {
  timeline: Timeline;
}

export const PlaceholderComposition = ({
  timeline,
}: PlaceholderCompositionProps) => {
  const frame = useCurrentFrame();
  const { durationInFrames, fps } = useVideoConfig();
  const progress = durationInFrames > 0 ? frame / durationInFrames : 0;
  const hue = 35 + progress * 25;
  const background = `linear-gradient(135deg, hsl(${hue} 70% 45%), hsl(${
    hue + 15
  } 65% 55%))`;

  return (
    <AbsoluteFill
      style={{
        backgroundImage: background,
        color: "white",
        fontFamily: "var(--font-sans, 'Montserrat', sans-serif)",
        padding: "2rem",
        justifyContent: "space-between",
      }}
    >
      <div>
        <p className="text-sm uppercase tracking-[0.2em]">
          Tutopanda Remotion Preview
        </p>
        <h1 className="text-3xl font-semibold mt-2">{timeline.name}</h1>
      </div>
      <div className="text-right">
        <p className="text-lg">
          Frame {frame} / {durationInFrames}
        </p>
        <p className="text-sm opacity-80">
          {(frame / fps).toFixed(2)}s of {timeline.duration.toFixed(1)}s
        </p>
      </div>
    </AbsoluteFill>
  );
};
