import { GripVertical, Film, Mic, Music, Volume2 } from "lucide-react";
import { type AnyTimelineClip, type Timeline, type TimelineTrackKey } from "@/types/timeline";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface TimelineChannel {
  id: TimelineTrackKey;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  height: number;
}

const TIMELINE_CHANNELS: TimelineChannel[] = [
  { id: "visual", name: "Visual Clips", icon: Film, height: 48 },
  { id: "voice", name: "Voice & Narration", icon: Mic, height: 48 },
  { id: "music", name: "Background Music", icon: Music, height: 48 },
  { id: "soundEffects", name: "Sound Effects", icon: Volume2, height: 48 },
];

interface TimelineTracksProps {
  timeline: Timeline;
  currentTime: number;
  totalContentDuration: number;
  pixelsPerSecond: number;
  onSeek: (time: number) => void;
  onClipSelect?: (track: TimelineTrackKey, clipId: string) => void;
  className?: string;
}

const getClipColor = (track: TimelineTrackKey, kind: AnyTimelineClip["kind"]) => {
  if (track === "visual" && kind === "kenBurns") {
    return "bg-blue-600 hover:bg-blue-500";
  }
  if (track === "visual") {
    return "bg-indigo-600 hover:bg-indigo-500";
  }
  if (track === "voice") {
    return "bg-purple-600 hover:bg-purple-500";
  }
  if (track === "music") {
    return "bg-emerald-600 hover:bg-emerald-500";
  }
  if (track === "soundEffects") {
    return "bg-amber-600 hover:bg-amber-500";
  }
  return "bg-slate-600 hover:bg-slate-500";
};

export const TimelineTracks = ({
  timeline,
  currentTime,
  totalContentDuration,
  pixelsPerSecond,
  onSeek,
  onClipSelect,
  className,
}: TimelineTracksProps) => {
  const channelHeight = 48;
  const trackHeight = 40;
  const totalTimelineHeight = TIMELINE_CHANNELS.length * channelHeight;

  const clipStyles = useMemo(() => {
    const styles = new Map<string, ReturnType<typeof getClipStyle>>();
    TIMELINE_CHANNELS.forEach((channel, index) => {
      const clips = timeline.tracks[channel.id] ?? [];
      clips.forEach((clip) => {
        styles.set(
          clip.id,
          getClipStyle({
            clip,
            channelIndex: index,
            channelHeight,
            trackHeight,
            totalContentDuration,
          }),
        );
      });
    });
    return styles;
  }, [timeline, channelHeight, trackHeight, totalContentDuration]);

  const handleTimelineClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const time = x / pixelsPerSecond;
    onSeek(Math.max(0, Math.min(time, totalContentDuration)));
  };

  const playheadPercent =
    totalContentDuration > 0
      ? Math.min((currentTime / totalContentDuration) * 100, 100)
      : 0;

  return (
    <div
      className={cn("overflow-y-auto", className)}
      style={{ height: `${totalTimelineHeight + 32}px` }}
    >
      <div className="relative p-4">
        <div className="px-2">
          <div
            className="relative cursor-pointer select-none w-full"
            style={{ height: `${totalTimelineHeight}px` }}
            onClick={handleTimelineClick}
          >
            {TIMELINE_CHANNELS.map((channel, index) => (
              <div
                key={`bg-${channel.id}`}
                className="absolute inset-x-0 border-b border-border/30"
                style={{ top: `${index * channelHeight}px`, height: `${channelHeight}px` }}
              />
            ))}

            {TIMELINE_CHANNELS.map((channel) => {
              const clips = timeline.tracks[channel.id] ?? [];
              return clips
                .slice()
                .sort((a, b) => a.startTime - b.startTime)
                .map((clip) => (
                  <div
                    key={clip.id}
                    className={cn(
                      "absolute rounded transition-all group border border-white/20 text-white text-xs overflow-hidden",
                      getClipColor(channel.id, clip.kind),
                      onClipSelect &&
                        (channel.id === "visual" ||
                          channel.id === "voice" ||
                          channel.id === "music") &&
                        "cursor-pointer",
                    )}
                    style={clipStyles.get(clip.id)}
                    onClick={(event) => {
                      if (
                        onClipSelect &&
                        (channel.id === "visual" ||
                          channel.id === "voice" ||
                          channel.id === "music")
                      ) {
                        event.stopPropagation();
                        onClipSelect(channel.id, clip.id);
                      }
                    }}
                  >
                    <div className="flex items-center gap-1 px-2 h-full text-white text-xs overflow-hidden">
                      <GripVertical className="w-3 h-3 opacity-70" />
                      <span className="truncate">{clip.name}</span>
                    </div>
                  </div>
                ));
            })}

            <div
              className="absolute top-0 w-0.5 bg-red-500 z-20 pointer-events-none inset-y-0"
              style={{ left: `${playheadPercent}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

interface ClipStyleArgs {
  clip: AnyTimelineClip;
  channelIndex: number;
  channelHeight: number;
  trackHeight: number;
  totalContentDuration: number;
}

const getClipStyle = ({
  clip,
  channelIndex,
  channelHeight,
  trackHeight,
  totalContentDuration,
}: ClipStyleArgs) => {
  const leftPercent =
    totalContentDuration > 0 ? (clip.startTime / totalContentDuration) * 100 : 0;
  const widthPercent =
    totalContentDuration > 0 ? (clip.duration / totalContentDuration) * 100 : 0;
  const verticalPadding = (channelHeight - trackHeight) / 2;
  const top = channelIndex * channelHeight + verticalPadding;

  return {
    left: `${leftPercent}%`,
    top: `${top}px`,
    width: `${Math.max(widthPercent, 0.5)}%`,
    height: `${trackHeight}px`,
  };
};
