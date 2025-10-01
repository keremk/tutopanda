import { AbsoluteFill, useCurrentFrame, useVideoConfig, Audio, Sequence } from 'remotion';
import { type Timeline } from '@/types/types';
import { KenBurnsComponent } from './KenBurns-component';

interface VideoCompositionProps {
  timeline: Timeline;
}

// Helper to ensure URL has the correct API prefix
const normalizeStorageUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('/api/storage/')) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `/api/storage/${url}`;
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

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

        switch (clip.kind) {
          case 'kenBurns':
            return (
              <KenBurnsComponent
                key={clip.id}
                component={{
                  ...clip,
                  imageUrl: normalizeStorageUrl(clip.imageUrl)
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
        if (!clip.audioUrl || !Number.isFinite(clip.duration) || clip.duration <= 0) {
          return null;
        }

        const startFrame = Math.round(clip.startTime * fps);
        const durationInFrames = Math.round(clip.duration * fps);

        return (
          <Sequence key={clip.id} from={startFrame} durationInFrames={durationInFrames}>
            <Audio
              src={normalizeStorageUrl(clip.audioUrl)}
              volume={clip.volume ?? 1.0}
            />
          </Sequence>
        );
      })}

      {/* Music track - Background music */}
      {(timeline.tracks?.music ?? []).map((clip) => {
        if (!clip.audioUrl || !Number.isFinite(clip.duration) || clip.duration <= 0) {
          return null;
        }

        const durationInFrames = Math.round(clip.duration * fps);

        return (
          <Sequence key={clip.id} from={0} durationInFrames={durationInFrames}>
            <Audio
              src={normalizeStorageUrl(clip.audioUrl)}
              volume={clip.volume ?? 0.3}
            />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const videoComposition = {
  id: 'VideoComposition',
  component: VideoComposition,
  durationInFrames: 450, // 15 seconds at 30fps
  fps: 30,
  width: 1920,
  height: 1080,
};
