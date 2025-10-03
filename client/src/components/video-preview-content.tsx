import { Player, PlayerRef, CallbackListener } from '@remotion/player';
import { type Timeline } from '@/types/types';
import { VideoComposition } from './remotion/video-composition';
import { useRef, useEffect } from 'react';

interface VideoPreviewContentProps {
  timeline: Timeline;
  currentTime: number;
  isPlaying: boolean;
  onSeek?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export default function VideoPreviewContent({ timeline, currentTime, isPlaying, onSeek, onPlay, onPause }: VideoPreviewContentProps) {
  const playerRef = useRef<PlayerRef>(null);
  const lastCurrentTime = useRef<number>(currentTime);
  const onSeekRef = useRef(onSeek);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);

  const fps = 30;
  const timelineSeconds = Number.isFinite(timeline?.duration)
    ? Math.max(timeline.duration, 0)
    : 0;
  const durationInFrames = Math.max(1, Math.round(timelineSeconds * fps));

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onSeekRef.current = onSeek;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
  });

  // Synchronize video player with timeline current time
  useEffect(() => {
    if (playerRef.current && Math.abs(currentTime - lastCurrentTime.current) > 0.1) {
      const frame = Math.round(currentTime * fps);
      playerRef.current.seekTo(frame);
      lastCurrentTime.current = currentTime;
    }
  }, [currentTime, fps]);

  // Synchronize play/pause state
  useEffect(() => {
    if (playerRef.current) {
      if (isPlaying) {
        playerRef.current.play();
      } else {
        playerRef.current.pause();
      }
    }
  }, [isPlaying]);

  // Set up event listeners when player becomes available
  useEffect(() => {
    const attachListeners = () => {
      const player = playerRef.current;
      if (!player) {
        return null;
      }

      const onTimeUpdate: CallbackListener<'timeupdate'> = (e) => {
        const time = e.detail.frame / fps; // Convert frame to seconds
        if (onSeekRef.current && Math.abs(time - lastCurrentTime.current) > 0.01) {
          lastCurrentTime.current = time;
          onSeekRef.current(time);
        }
      };

      const onPlayerPlay = () => {
        console.log('🎬 Video player started');
        if (onPlayRef.current) {
          onPlayRef.current();
        }
      };

      const onPlayerPause = () => {
        console.log('⏸️ Video player paused');
        if (onPauseRef.current) {
          onPauseRef.current();
        }
      };

      // Add event listeners
      player.addEventListener('timeupdate', onTimeUpdate);
      player.addEventListener('play', onPlayerPlay);
      player.addEventListener('pause', onPlayerPause);

      return () => {
        player.removeEventListener('timeupdate', onTimeUpdate);
        player.removeEventListener('play', onPlayerPlay);
        player.removeEventListener('pause', onPlayerPause);
      };
    };

    // Try to attach immediately if player is ready
    const cleanup = attachListeners();
    if (cleanup) {
      return cleanup;
    }

    // Otherwise, poll until player is ready
    const interval = setInterval(() => {
      const cleanup = attachListeners();
      if (cleanup) {
        clearInterval(interval);
        return cleanup;
      }
    }, 100);

    return () => clearInterval(interval);
  }, [fps]);

  return (
    <div className="bg-black rounded-lg overflow-hidden flex items-center justify-center h-full" data-testid="video-preview">
      <Player
        key={timeline.id}
        ref={playerRef}
        component={VideoComposition}
        inputProps={{ timeline }}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={1920}
        compositionHeight={1080}
        style={{
          width: '100%',
          height: '100%',
          maxHeight: '100%',
          objectFit: 'contain',
        }}
        controls
        loop={false}
        showVolumeControls={true}
        acknowledgeRemotionLicense={true}
        data-testid="remotion-player"
      />
    </div>
  );
}
