import { useEffect, useMemo, useRef } from "react";
import { Player, type PlayerRef, type CallbackListener } from "@remotion/player";
import type { TimelineDocument } from "@/types/timeline";
import { VideoComposition } from "@/remotion/VideoComposition";

interface RemotionPreviewProps {
  movieId: string;
  timeline: TimelineDocument;
  currentTime: number;
  isPlaying: boolean;
  onSeek?: (time: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  aspectRatio?: string;
}

const DEFAULT_ASPECT_RATIO = "16:9";
const FPS = 30;

export const RemotionPreview = ({
  movieId,
  timeline,
  currentTime,
  isPlaying,
  onSeek,
  onPlay,
  onPause,
  aspectRatio = DEFAULT_ASPECT_RATIO,
}: RemotionPreviewProps) => {
  const playerRef = useRef<PlayerRef>(null);
  const lastTimeRef = useRef<number>(currentTime);
  const onSeekRef = useRef(onSeek);
  const onPlayRef = useRef(onPlay);
  const onPauseRef = useRef(onPause);

  useEffect(() => {
    onSeekRef.current = onSeek;
    onPlayRef.current = onPlay;
    onPauseRef.current = onPause;
  }, [onSeek, onPlay, onPause]);

  const { width, height } = useMemo(() => {
    const [w, h] = (aspectRatio || DEFAULT_ASPECT_RATIO).split(":").map(Number);
    const baseHeight = 1080;
    const calculatedWidth = Math.round((baseHeight / h) * w);
    return { width: calculatedWidth, height: baseHeight };
  }, [aspectRatio]);

  const durationSeconds = Math.max(timeline.duration, 1);
  const durationInFrames = Math.max(1, Math.round(durationSeconds * FPS));
  const safeCurrentTime = Math.max(
    0,
    Math.min(currentTime, durationInFrames / FPS),
  );

  useEffect(() => {
    if (!playerRef.current) {
      return;
    }
    if (Math.abs(safeCurrentTime - lastTimeRef.current) > 0.05) {
      playerRef.current.seekTo(Math.round(safeCurrentTime * FPS));
      lastTimeRef.current = safeCurrentTime;
    }
  }, [safeCurrentTime]);

  useEffect(() => {
    if (!playerRef.current) {
      return;
    }
    if (isPlaying) {
      playerRef.current.play();
    } else {
      playerRef.current.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const attachListeners = () => {
      const player = playerRef.current;
      if (!player) {
        return null;
      }

      const handleFrameUpdate: CallbackListener<"frameupdate"> = (event) => {
        const time = event.detail.frame / FPS;
        if (onSeekRef.current && Math.abs(time - lastTimeRef.current) > 0.01) {
          lastTimeRef.current = time;
          onSeekRef.current(time);
        }
      };

      const handlePlay = () => {
        onPlayRef.current?.();
      };

      const handlePause = () => {
        onPauseRef.current?.();
      };

      player.addEventListener("frameupdate", handleFrameUpdate);
      player.addEventListener("play", handlePlay);
      player.addEventListener("pause", handlePause);

      return () => {
        player.removeEventListener("frameupdate", handleFrameUpdate);
        player.removeEventListener("play", handlePlay);
        player.removeEventListener("pause", handlePause);
      };
    };

    const cleanup = attachListeners();
    if (cleanup) {
      return cleanup;
    }

    const interval = setInterval(() => {
      const maybeCleanup = attachListeners();
      if (maybeCleanup) {
        clearInterval(interval);
      }
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-black rounded-xl overflow-hidden flex items-center justify-center h-full">
      <Player
        key={timeline.id}
        ref={playerRef}
        component={VideoComposition as never}
        inputProps={{ timeline, movieId }}
        durationInFrames={durationInFrames}
        fps={FPS}
        compositionWidth={width}
        compositionHeight={height}
        style={{
          width: "100%",
          height: "100%",
          maxHeight: "100%",
          objectFit: "contain",
        }}
        controls={false}
        loop={false}
        showVolumeControls={false}
        numberOfSharedAudioTags={0}
        acknowledgeRemotionLicense
      />
    </div>
  );
};
