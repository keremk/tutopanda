import { AbsoluteFill, useCurrentFrame, useVideoConfig, Audio, Sequence, Video } from 'remotion';
import { useMemo } from 'react';
import type { Timeline, ImageAsset, NarrationSettings, MusicSettings, VisualClip, VideoAsset } from '@/types/types';
import { KenBurnsComponent } from './KenBurns-component';
import { buildVideoAssetUrl } from '@/lib/video-assets';

interface VideoCompositionProps {
  timeline: Timeline;
  images: ImageAsset[];
  videos: VideoAsset[];
  narration: NarrationSettings[];
  music: MusicSettings[];
  cacheKey?: number;
}

// Helper to ensure URL has the correct API prefix with cache-busting
const normalizeStorageUrl = (url: string | undefined, cacheKey?: number): string | undefined => {
  if (!url) return undefined;

  let baseUrl: string;
  if (url.startsWith('/api/storage/')) {
    baseUrl = url;
  } else if (url.startsWith('http://') || url.startsWith('https://')) {
    baseUrl = url;
  } else {
    baseUrl = `/api/storage/${url}`;
  }

  // Add cache-busting parameter if provided
  if (cacheKey) {
    const separator = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${separator}v=${cacheKey}`;
  }

  return baseUrl;
};

const buildAssetMaps = (
  images: ImageAsset[],
  videos: VideoAsset[],
  narration: NarrationSettings[],
  music: MusicSettings[]
) => {
  const imageMap = new Map<string, ImageAsset>();
  const videoMap = new Map<string, VideoAsset>();
  const narrationMap = new Map<string, NarrationSettings>();
  const musicMap = new Map<string, MusicSettings>();

  images.forEach((asset) => {
    imageMap.set(asset.id, asset);
  });
  videos.forEach((asset) => {
    videoMap.set(asset.id, asset);
  });
  narration.forEach((asset) => {
    narrationMap.set(asset.id, asset);
  });
  music.forEach((asset) => {
    musicMap.set(asset.id, asset);
  });

  return { imageMap, videoMap, narrationMap, musicMap };
};

const resolveImageUrl = (
  clip: VisualClip,
  imageMap: Map<string, ImageAsset>,
  cacheKey?: number
) => {
  if (clip.kind !== 'kenBurns' || !clip.imageAssetId) {
    return undefined;
  }
  const asset = imageMap.get(clip.imageAssetId);
  return normalizeStorageUrl(asset?.sourceUrl, cacheKey);
};

const resolveAudioUrl = (
  assetId: string | undefined,
  assetMap: Map<string, { sourceUrl?: string; audioUrl?: string }>,
  cacheKey?: number
) => {
  if (!assetId) {
    return undefined;
  }
  const asset = assetMap.get(assetId);
  return normalizeStorageUrl(asset?.sourceUrl ?? (asset as MusicSettings | undefined)?.audioUrl, cacheKey);
};

const resolveVideoUrl = (
  clip: VisualClip,
  videoMap: Map<string, VideoAsset>,
  cacheKey?: number
) => {
  if (clip.kind !== 'video' || !clip.videoAssetId) {
    return undefined;
  }

  const asset = videoMap.get(clip.videoAssetId);
  if (!asset) {
    return undefined;
  }

  return buildVideoAssetUrl(asset, { cacheKey }) ?? undefined;
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  timeline,
  images,
  videos,
  narration,
  music,
  cacheKey,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const { imageMap, videoMap, narrationMap, musicMap } = useMemo(
    () => buildAssetMaps(images, videos, narration, music),
    [images, videos, narration, music]
  );

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Visual track */}
      {(timeline.tracks?.visual ?? []).map((clip) => {
        if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
          return null;
        }

        if (clip.kind === 'video') {
          const videoUrl = resolveVideoUrl(clip, videoMap, cacheKey);
          if (!videoUrl) {
            return null;
          }

          const from = Math.round(clip.startTime * fps);
          const durationInFrames = Math.round(clip.duration * fps);

          return (
            <Sequence key={clip.id} from={from} durationInFrames={durationInFrames}>
              <Video
                src={videoUrl}
                muted={true}
                volume={clip.volume ?? 0}
                style={{ width: '100%', height: '100%' }}
              />
            </Sequence>
          );
        }

        const isActive =
          currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;

        if (!isActive) return null;

        const relativeTime = currentTime - clip.startTime;
        const progress = Math.min(relativeTime / clip.duration, 1);
        const imageUrl = resolveImageUrl(clip, imageMap, cacheKey);

        if (!imageUrl) {
          return null;
        }

        if (clip.kind !== 'kenBurns') {
          return null;
        }

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
      })}

      {/* Voice track - Narration audio */}
      {(timeline.tracks?.voice ?? []).map((clip) => {
        const audioUrl = resolveAudioUrl(clip.narrationAssetId, narrationMap, cacheKey);

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
        const audioUrl = resolveAudioUrl(clip.musicAssetId, musicMap, cacheKey);

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
