import { Film, Mic, Music, Volume2, Play, Pause } from "lucide-react";
import { useMemo } from "react";

import type { TimelineTrackKey } from "@/types/timeline";

interface TrackChannel {
  id: TimelineTrackKey;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  height: number;
}

const TIMELINE_CHANNELS: TrackChannel[] = [
  { id: "visual", name: "Visual Clips", icon: Film, height: 48 },
  { id: "voice", name: "Voice & Narration", icon: Mic, height: 48 },
  { id: "music", name: "Background Music", icon: Music, height: 48 },
  { id: "soundEffects", name: "Sound Effects", icon: Volume2, height: 48 },
];

interface TrackHeadersProps {
  isPlaying?: boolean;
  onPlay?: () => void;
  onPause?: () => void;
}

export const TrackHeaders = ({
  isPlaying = false,
  onPlay,
  onPause,
}: TrackHeadersProps) => {
  const channelHeight = 48;

  const handlePlayPauseClick = () => {
    if (isPlaying) {
      onPause?.();
    } else {
      onPlay?.();
    }
  };

  const renderChannels = useMemo(
    () =>
      TIMELINE_CHANNELS.map((channel) => {
        const IconComponent = channel.icon;
        return (
          <div
            key={channel.id}
            className="flex items-center justify-center hover:bg-muted/30 transition-colors border-b border-muted/90"
            style={{ height: `${channelHeight}px` }}
            title={channel.name}
          >
            <IconComponent className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
          </div>
        );
      }),
    [],
  );

  return (
    <div className="w-16 shrink-0 bg-background/80 border-r border-border/30">
      <div
        className="border-b border-muted/90 flex items-center justify-center"
        style={{ height: "72px" }}
      >
        <button
          onClick={handlePlayPauseClick}
          className="p-2 rounded-md hover:bg-muted/50 transition-colors"
          aria-label={isPlaying ? "Pause" : "Play"}
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 text-foreground" />
          ) : (
            <Play className="w-5 h-5 text-foreground" />
          )}
        </button>
      </div>
      {renderChannels}
    </div>
  );
};
