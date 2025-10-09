import { AbsoluteFill, useCurrentFrame, useVideoConfig, Audio, Sequence } from 'remotion';
import { useMemo } from 'react';
import type {
  Timeline,
  ImageAsset,
  NarrationSettings,
  MusicSettings,
  KenBurnsClip,
} from '@/types/types';
import { KenBurnsComponent } from './KenBurns-component';

interface VideoCompositionProps {
  timeline: Timeline;
  images: ImageAsset[];
  narration: NarrationSettings[];
  music: MusicSettings[];
}

// Helper to ensure URL has the correct API prefix
const normalizeStorageUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('/api/storage/')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `/api/storage/${url}`;
};

const buildAssetMaps = (
  images: ImageAsset[],
  narration: NarrationSettings[],
  music: MusicSettings[]
) => {
  const imageMap = new Map<string, ImageAsset>();
  const narrationMap = new Map<string, NarrationSettings>();
  const musicMap = new Map<string, MusicSettings>();

  images.forEach((asset) => {
    imageMap.set(asset.id, asset);
  });
  narration.forEach((asset) => {
    narrationMap.set(asset.id, asset);
  });
  music.forEach((asset) => {
    musicMap.set(asset.id, asset);
  });

  return { imageMap, narrationMap, musicMap };
};

const resolveImageUrl = (
  clip: KenBurnsClip,
  imageMap: Map<string, ImageAsset>
) => {
  if (!clip.imageAssetId) {
    return undefined;
  }
  const asset = imageMap.get(clip.imageAssetId);
  return normalizeStorageUrl(asset?.sourceUrl);
};

const resolveAudioUrl = (
  assetId: string | undefined,
  assetMap: Map<string, { sourceUrl?: string; audioUrl?: string }>
) => {
  if (!assetId) {
    return undefined;
  }
  const asset = assetMap.get(assetId);
  return normalizeStorageUrl(asset?.sourceUrl ?? (asset as MusicSettings | undefined)?.audioUrl);
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  timeline,
  images,
  narration,
  music,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const { imageMap, narrationMap, musicMap } = useMemo(
    () => buildAssetMaps(images, narration, music),
    [images, narration, music]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Visual track - Ken Burns effects */}
      {(timeline.tracks?.visual ?? []).map((clip) => {
        if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
          return null;
        }

        const isActive =
          currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;

        if (!isActive) return null;

        const relativeTime = currentTime - clip.startTime;
        const progress = Math.min(relativeTime / clip.duration, 1);
        const imageUrl = resolveImageUrl(clip, imageMap);

        if (!imageUrl) {
          return null;
        }

        switch (clip.kind) {
          case 'kenBurns':
            return (
              <KenBurnsComponent
                key={clip.id}
                component={{
                  ...clip,
                  imageUrl,
                }}
                progress={progress}
              />
            );
          default:
            return null;
        }
      })}

      {/* Voice track - Narration audio */}
      {(timeline.tracks?.voice ?? []).map((clip) => {
        const audioUrl = resolveAudioUrl(clip.narrationAssetId, narrationMap);

        if (!audioUrl || !Number.isFinite(clip.duration) || clip.duration <= 0) {
          return null;
        }

        const startFrame = Math.round(clip.startTime * fps);
        const durationInFrames = Math.round(clip.duration * fps);

        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={durationInFrames}>
            <Audio
              src={audioUrl}
              volume={clip.volume ?? 1.0}
            />
          </Sequence>
        );
      })}

      {/* Music track - Background music */}
      {(timeline.tracks?.music ?? []).map((clip) => {
        const audioUrl = resolveAudioUrl(clip.musicAssetId, musicMap);

        if (!audioUrl || !Number.isFinite(clip.duration) || clip.duration <= 0) {
          return null;
        }

        const durationInFrames = Math.round(clip.duration * fps);

        return (
          <Sequence key={clip.id} from={0} durationInFrames={durationInFrames}>
            <Audio
              src={audioUrl}
              volume={clip.volume ?? 0.3}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

// Note: Dimensions are now dynamic based on aspect ratio config
// This export is kept for compatibility but dimensions should be set via Player props
export const videoComposition = {
  id: 'VideoComposition',
  component: VideoComposition,
  durationInFrames: 450, // 15 seconds at 30fps
  fps: 30,
  width: 1920,
  height: 1080,
};
