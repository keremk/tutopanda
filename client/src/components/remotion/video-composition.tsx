import { AbsoluteFill, useCurrentFrame, useVideoConfig, Audio, Sequence } from 'remotion';
import { useMemo, useEffect } from 'react';
import { preloadVideo } from '@remotion/preload';
import type { Timeline, ImageAsset, NarrationSettings, MusicSettings, VisualClip, VideoAsset } from '@/types/types';
import { KenBurnsComponent } from './KenBurns-component';
import { VideoClipRenderer } from './video-clip-renderer';
import { buildVideoAssetUrl } from '@/lib/video-assets';
import { SubtitleDisplay } from './subtitle-display';

interface VideoCompositionProps {
  timeline: Timeline;
  images: ImageAsset[];
  videos: VideoAsset[];
  narration: NarrationSettings[];
  music: MusicSettings[];
  cacheKey?: number;
  useSubtitles?: boolean;
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

// Helper to split text into N segments
const splitTextIntoSegments = (text: string, numSegments: number): string[] => {
  if (!text || numSegments <= 0) {
    return [];
  }

  const words = text.trim().split(/\s+/);
  const wordsPerSegment = Math.ceil(words.length / numSegments);
  const segments: string[] = [];

  for (let i = 0; i < numSegments; i++) {
    const start = i * wordsPerSegment;
    const end = Math.min(start + wordsPerSegment, words.length);
    const segment = words.slice(start, end).join(' ');
    if (segment) {
      segments.push(segment);
    }
  }

  return segments;
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  timeline,
  images,
  videos,
  narration,
  music,
  cacheKey,
  useSubtitles = false,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;
  const { imageMap, videoMap, narrationMap, musicMap } = useMemo(
    () => buildAssetMaps(images, videos, narration, music),
    [images, videos, narration, music]
  );

  // Memoize video URLs to prevent recalculation on every render
  const videoUrlMap = useMemo(() => {
    const urlMap = new Map<string, string>();
    const videoClips = timeline.tracks?.visual?.filter(clip => clip.kind === 'video') ?? [];

    for (const clip of videoClips) {
      const videoUrl = resolveVideoUrl(clip, videoMap, cacheKey);
      if (videoUrl && clip.id) {
        urlMap.set(clip.id, videoUrl);
      }
    }

    return urlMap;
  }, [timeline.tracks?.visual, videoMap, cacheKey]);

  // Memoize narration URLs
  const narrationUrlMap = useMemo(() => {
    const urlMap = new Map<string, string>();
    const voiceClips = timeline.tracks?.voice ?? [];

    for (const clip of voiceClips) {
      const audioUrl = resolveAudioUrl(clip.narrationAssetId, narrationMap, cacheKey);
      if (audioUrl && clip.id) {
        urlMap.set(clip.id, audioUrl);
      }
    }

    return urlMap;
  }, [timeline.tracks?.voice, narrationMap, cacheKey]);

  // Memoize music URLs
  const musicUrlMap = useMemo(() => {
    const urlMap = new Map<string, string>();
    const musicClips = timeline.tracks?.music ?? [];

    for (const clip of musicClips) {
      const audioUrl = resolveAudioUrl(clip.musicAssetId, musicMap, cacheKey);
      if (audioUrl && clip.id) {
        urlMap.set(clip.id, audioUrl);
      }
    }

    return urlMap;
  }, [timeline.tracks?.music, musicMap, cacheKey]);

  // Preload all video URLs to prevent black screens during playback
  useEffect(() => {
    const unpreloadFunctions: Array<() => void> = [];

    // Use memoized videoUrlMap instead of recalculating
    videoUrlMap.forEach((videoUrl) => {
      const unpreload = preloadVideo(videoUrl);
      unpreloadFunctions.push(unpreload);
    });

    // Cleanup: stop preloading when component unmounts
    return () => {
      unpreloadFunctions.forEach(fn => fn());
    };
  }, [videoUrlMap]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {/* Visual track */}
      {(timeline.tracks?.visual ?? []).map((clip) => {
        if (!Number.isFinite(clip.duration) || clip.duration <= 0) {
          return null;
        }

        if (clip.kind === 'video') {
          const videoUrl = videoUrlMap.get(clip.id);
          if (!videoUrl) {
            return null;
          }

          // Use new VideoClipRenderer component
          return <VideoClipRenderer key={clip.id} clip={clip} videoUrl={videoUrl} />;
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
        const audioUrl = narrationUrlMap.get(clip.id);

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
        const audioUrl = musicUrlMap.get(clip.id);

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

      {/* Subtitles - Display narration text */}
      {useSubtitles && (timeline.tracks?.voice ?? []).map((clip) => {
        if (!Number.isFinite(clip.duration) || clip.duration <= 0 || !clip.narrationAssetId) {
          return null;
        }

        const narrationAsset = narrationMap.get(clip.narrationAssetId);
        const finalScript = narrationAsset?.finalScript;

        if (!finalScript) {
          return null;
        }

        // Split the finalScript into 3 segments
        const NUM_SEGMENTS = 3;
        const segments = splitTextIntoSegments(finalScript, NUM_SEGMENTS);
        const segmentDuration = clip.duration / segments.length;

        return segments.map((segmentText, index) => {
          const segmentStartTime = clip.startTime + (index * segmentDuration);
          const startFrame = Math.round(segmentStartTime * fps);
          const durationInFrames = Math.round(segmentDuration * fps);

          return (
            <Sequence
              key={`${clip.id}-subtitle-${index}`}
              from={startFrame}
              durationInFrames={durationInFrames}
            >
              <SubtitleDisplay text={segmentText} />
            </Sequence>
          );
        });
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
