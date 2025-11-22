import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";
import type { ImageClip, AssetMap } from "../../types/timeline.js";
import { KenBurnsEffectFrame } from "./KenBurnsEffectFrame.js";

interface KenBurnsClipProps {
  clip: ImageClip;
  assets: AssetMap;
}

const allocateFrames = (totalFrames: number, segments: number): number[] => {
  if (segments <= 0) {
    return [totalFrames];
  }
  const base = Math.floor(totalFrames / segments);
  const remainder = totalFrames % segments;
  return Array.from({ length: segments }, (_, index) => base + (index < remainder ? 1 : 0));
};

export const KenBurnsClip = ({ clip, assets }: KenBurnsClipProps) => {
  const { fps } = useVideoConfig();
  const effects = clip.properties.effects ?? [];
  if (effects.length === 0) {
    return null;
  }

  const totalFrames = Math.max(1, Math.round(clip.duration * fps));
  const segments = allocateFrames(totalFrames, effects.length);

  const offsets = segments.map((_, index) =>
    segments.slice(0, index).reduce((sum, value) => sum + value, 0),
  );

  return (
    <AbsoluteFill>
      {effects.map((effect, index) => {
        const frames = segments[index] ?? 1;
        const from = offsets[index] ?? 0;
        const assetUrl = assets[effect.assetId];
        if (!assetUrl) {
          return null;
        }
        return (
          <Sequence
            key={`${clip.id}-${effect.assetId}-${index}`}
            from={from}
            durationInFrames={frames}
          >
            <KenBurnsEffectFrame effect={effect} imageUrl={assetUrl} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
