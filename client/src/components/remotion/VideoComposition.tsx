import { Composition, AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { type Timeline } from '@/schema';
import { KenBurnsComponent } from './KenBurnsComponent';
import { MapTroopMovementComponent } from './MapTroopMovementComponent';

interface VideoCompositionProps {
  timeline: Timeline;
}

export const VideoComposition: React.FC<VideoCompositionProps> = ({ timeline }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTime = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000' }}>
      {timeline.components.map((component) => {
        const isActive = currentTime >= component.startTime && currentTime < component.startTime + component.duration;
        
        if (!isActive) return null;

        const relativeTime = currentTime - component.startTime;
        const progress = Math.min(relativeTime / component.duration, 1);

        switch (component.type) {
          case 'ken_burns':
            return (
              <KenBurnsComponent
                key={component.id}
                component={component}
                progress={progress}
              />
            );
          case 'map_troop_movement':
            return (
              <MapTroopMovementComponent
                key={component.id}
                component={component}
                progress={progress}
              />
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