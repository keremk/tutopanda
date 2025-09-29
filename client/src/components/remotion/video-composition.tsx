import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { type Timeline } from '@/types/types';
import { KenBurnsComponent } from './KenBurns-component';

interface VideoCompositionProps {
  timeline: Timeline;
}

export const VideoComposition: React.FC<VideoCompositionProps> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {(timeline.tracks?.visual ?? []).map((clip) => {
        const isActive =
          currentTime >= clip.startTime && currentTime < clip.startTime + clip.duration;

        if (!isActive) return null;

        const relativeTime = currentTime - clip.startTime;
        const progress = Math.min(relativeTime / clip.duration, 1);

        switch (clip.kind) {
          case 'kenBurns':
            return (
              <KenBurnsComponent key={clip.id} component={clip} progress={progress} />
            );
          default:
            return null;
        }
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
