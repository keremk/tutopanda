import { Player, PlayerRef } from '@remotion/player';
import { useRef, useMemo, useEffect } from 'react';
import { AbsoluteFill, Img, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { KenBurnsClip } from '@/types/types';
import { kenBurnsEffects } from '@/lib/timeline/ken-burns';

interface EffectPreviewProps {
  clip: KenBurnsClip;
  imageUrl: string;
  effectName?: string;
}

// Inner composition that renders the Ken Burns effect
const EffectPreviewComposition: React.FC<{
  clip: KenBurnsClip;
  imageUrl: string;
  effectName?: string;
}> = ({ clip, imageUrl, effectName }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;

  // Use override effect if provided, otherwise use clip's effect
  const effect = effectName && kenBurnsEffects[effectName]
    ? kenBurnsEffects[effectName]
    : null;

  const scale = interpolate(
    progress,
    [0, 1],
    [effect?.startScale ?? clip.startScale, effect?.endScale ?? clip.endScale]
  );
  const translateX = interpolate(
    progress,
    [0, 1],
    [effect?.startX ?? clip.startX, effect?.endX ?? clip.endX]
  );
  const translateY = interpolate(
    progress,
    [0, 1],
    [effect?.startY ?? clip.startY, effect?.endY ?? clip.endY]
  );

  // Debug logging on first frame
  if (frame === 0) {
    console.log("Effect Preview Composition:", {
      effectName,
      effect,
      clipEffect: {
        startScale: clip.startScale,
        endScale: clip.endScale,
        startX: clip.startX,
        endX: clip.endX,
        startY: clip.startY,
        endY: clip.endY,
      },
      usingEffect: effect ? "override" : "clip",
      durationInFrames,
      fps
    });
  }

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'hidden',
        }}
      >
        <Img
          src={imageUrl}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: `scale(${scale}) translate(${translateX}px, ${translateY}px)`,
            transition: 'none',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export default function EffectPreview({ clip, imageUrl, effectName }: EffectPreviewProps) {
  const playerRef = useRef<PlayerRef>(null);

  const fps = 30;
  const durationInFrames = Math.max(1, Math.round(clip.duration * fps));

  // Calculate dimensions (16:9 aspect ratio)
  const { width, height } = useMemo(() => {
    return { width: 1920, height: 1080 };
  }, []);

  // Debug logging
  useEffect(() => {
    console.log("EffectPreview - Clip:", clip);
    console.log("EffectPreview - Image URL:", imageUrl);
    console.log("EffectPreview - Effect Name:", effectName);
    console.log("EffectPreview - Duration in frames:", durationInFrames);
  }, [clip, imageUrl, effectName, durationInFrames]);

  // Reset player and start playing when clip or effect changes
  useEffect(() => {
    const timer = setTimeout(() => {
      if (playerRef.current) {
        playerRef.current.seekTo(0);
        playerRef.current.play();
        console.log("Effect Preview - Player started for effect:", effectName || clip.effectName);
      }
    }, 100); // Small delay to ensure player is ready

    return () => clearTimeout(timer);
  }, [clip.id, effectName, clip.effectName]);

  return (
    <div className="w-full h-full bg-black rounded-lg overflow-hidden flex items-center justify-center">
      <Player
        key={`${clip.id}-${effectName || clip.effectName}`}
        ref={playerRef}
        component={EffectPreviewComposition}
        inputProps={{
          clip,
          imageUrl,
          effectName,
        }}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
        controls={false}
        loop={true}
        autoPlay={true}
        showVolumeControls={false}
        numberOfSharedAudioTags={0}
        acknowledgeRemotionLicense={true}
      />
    </div>
  );
}
