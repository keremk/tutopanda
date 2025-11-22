import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { KenBurnsEffect } from "../../types/timeline.js";

interface KenBurnsEffectFrameProps {
  effect: KenBurnsEffect;
  imageUrl: string;
}

export const KenBurnsEffectFrame = ({ effect, imageUrl }: KenBurnsEffectFrameProps) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const maxFrames = Math.max(1, durationInFrames);
  const progress = maxFrames <= 1 ? 0 : frame / (maxFrames - 1);
  const startScale = effect.startScale ?? 1;
  const endScale = effect.endScale ?? startScale;
  const startX = effect.startX ?? 0;
  const endX = effect.endX ?? startX;
  const startY = effect.startY ?? 0;
  const endY = effect.endY ?? startY;

  const scale = interpolate(progress, [0, 1], [startScale, endScale]);
  const translateX = interpolate(progress, [0, 1], [startX, endX]);
  const translateY = interpolate(progress, [0, 1], [startY, endY]);

  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", overflow: "hidden" }}>
      <Img
        src={imageUrl}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
          transition: "none",
        }}
      />
    </AbsoluteFill>
  );
};
