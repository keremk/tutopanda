import { Player, PlayerRef, CallbackListener } from '@remotion/player';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { type Timeline } from '@/schema';
import { VideoComposition } from './remotion/VideoComposition';
import { useRef, useEffect } from 'react';

interface VideoPreviewProps {
  timeline: Timeline;
  currentTime: number;
  isPlaying: boolean;
  onSeek?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
}

export default function VideoPreview({ timeline, currentTime, isPlaying, onSeek, onPlay, onPause }: VideoPreviewProps) {
  const playerRef = useRef<PlayerRef>(null);
  const lastCurrentTime = useRef<number>(currentTime);
  const onSeekRef = useRef(onSeek);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    onSeekRef.current = onSeek;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
  });

  // Synchronize video player with timeline current time
  useEffect(() => {
    if (playerRef.current && Math.abs(currentTime - lastCurrentTime.current) > 0.1) {
      const frame = Math.round(currentTime * 30); // 30 FPS
      playerRef.current.seekTo(frame);
      lastCurrentTime.current = currentTime;
    }
  }, [currentTime]);

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
      if (!player) return null;

      const onTimeUpdate: CallbackListener<'timeupdate'> = (e) => {
        const time = e.detail.frame / 30; // Convert frame to seconds
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
    if (cleanup) return cleanup;

    // Otherwise, poll until player is ready
    const interval = setInterval(() => {
      const cleanup = attachListeners();
      if (cleanup) {
        clearInterval(interval);
        return cleanup;
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Video Preview</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="bg-black rounded-lg overflow-hidden" data-testid="video-preview">
          <Player
            ref={playerRef}
            component={VideoComposition}
            inputProps={{ timeline }}
            durationInFrames={timeline.duration * 30} // 30 FPS
            fps={30}
            compositionWidth={1920}
            compositionHeight={1080}
            style={{
              width: '100%',
              height: 'auto',
              aspectRatio: '16/9',
            }}
            controls
            loop={false}
            showVolumeControls={false}
            acknowledgeRemotionLicense={true}
            data-testid="remotion-player"
          />
        </div>
        <div className="mt-4 text-sm text-muted-foreground">
          Resolution: 1920x1080 | Frame Rate: 30 FPS | Duration: {timeline.duration}s
        </div>
      </CardContent>
    </Card>
  );
}