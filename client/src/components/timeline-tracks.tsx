import React, { useRef, useCallback } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { GripVertical, Film, Mic, Music, Volume2 } from 'lucide-react';
import { type Timeline, type TimelineTrackKey, type AnyTimelineClip } from '@/types/types';
import { cn } from '@/lib/utils';

interface TimelineChannel {
  id: TimelineTrackKey;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  height: number;
}

const TIMELINE_CHANNELS: TimelineChannel[] = [
  {
    id: 'visual',
    name: 'Visual Clips',
    icon: Film,
    height: 48,
  },
  {
    id: 'voice',
    name: 'Voice & Narration',
    icon: Mic,
    height: 48,
  },
  {
    id: 'music',
    name: 'Background Music',
    icon: Music,
    height: 48,
  },
  {
    id: 'soundEffects',
    name: 'Sound Effects',
    icon: Volume2,
    height: 48,
  },
];

interface TimelineTracksProps {
  timeline: Timeline;
  currentTime: number;
  totalContentDuration: number;
  needsHorizontalScroll: boolean;
  effectiveWidth: number;
  pixelsPerSecond: number;
  onSeek: (time: number) => void;
  onClipSelect?: (track: TimelineTrackKey, clipId: string) => void;
  className?: string;
}

export function TimelineTracks({
  timeline,
  currentTime,
  totalContentDuration,
  needsHorizontalScroll,
  effectiveWidth,
  pixelsPerSecond,
  onSeek,
  onClipSelect,
  className,
}: TimelineTracksProps) {
  const timelineRef = useRef<HTMLDivElement>(null);

  const channelHeight = 48;
  const totalTimelineHeight = TIMELINE_CHANNELS.length * channelHeight;

  const getClipStyle = (clip: AnyTimelineClip, channelIndex: number) => {
    const leftPercent = totalContentDuration > 0 ? (clip.startTime / totalContentDuration) * 100 : 0;
    const widthPercent = totalContentDuration > 0 ? (clip.duration / totalContentDuration) * 100 : 0;

    const trackHeight = 40;
    const verticalPadding = (channelHeight - trackHeight) / 2;
    const top = channelIndex * channelHeight + verticalPadding;

    return {
      left: `${leftPercent}%`,
      top: `${top}px`,
      width: `${Math.max(widthPercent, 0.5)}%`,
      height: `${trackHeight}px`,
    };
  };

  const getClipColor = (track: TimelineTrackKey, kind: AnyTimelineClip['kind']) => {
    if (track === 'visual' && kind === 'kenBurns') return 'bg-blue-600 hover:bg-blue-500';
    if (track === 'voice') return 'bg-purple-600 hover:bg-purple-500';
    if (track === 'music') return 'bg-emerald-600 hover:bg-emerald-500';
    if (track === 'soundEffects') return 'bg-amber-600 hover:bg-amber-500';
    return 'bg-gray-600 hover:bg-gray-500';
  };

  const pixelsToTime = (pixels: number) => (pixels / pixelsPerSecond);


  const handleTimelineClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelsToTime(x);
    onSeek(Math.max(0, Math.min(time, totalContentDuration)));
  };


  return (
    <ScrollArea style={{ height: `${totalTimelineHeight + 32}px` }}>
        <div className="relative p-4">
          <div className="px-2">
            <div
              ref={timelineRef}
              className="relative cursor-pointer select-none w-full"
              style={{ height: `${totalTimelineHeight}px` }}
              onClick={handleTimelineClick}
              data-testid="timeline-tracks"
            >
                {/* Channel Background Lines */}
                {TIMELINE_CHANNELS.map((channel, index) => (
                  <div
                    key={`bg-${channel.id}`}
                    className="absolute inset-x-0 border-b border-border/30"
                    style={{
                      top: `${index * channelHeight}px`,
                      height: `${channelHeight}px`
                    }}
                  />
                ))}

                {TIMELINE_CHANNELS.map((channel, channelIndex) => {
                  const clips = timeline.tracks?.[channel.id] ?? [];

                  return clips
                    .slice()
                    .sort((a, b) => a.startTime - b.startTime)
                    .map((clip) => (
                      <div
                        key={clip.id}
                        className={cn(
                          'absolute rounded transition-all group border border-white/20',
                          getClipColor(channel.id, clip.kind),
                          onClipSelect && (channel.id === 'visual' || channel.id === 'voice' || channel.id === 'music') && 'cursor-pointer'
                        )}
                        style={getClipStyle(clip, channelIndex)}
                        data-testid={`timeline-clip-${clip.id}`}
                        onClick={(e) => {
                          if (onClipSelect && (channel.id === 'visual' || channel.id === 'voice' || channel.id === 'music')) {
                            e.stopPropagation();
                            onClipSelect(channel.id, clip.id);
                          }
                        }}
                      >
                        {/* Clip content */}
                        <div className="flex items-center gap-1 px-2 h-full text-white text-xs overflow-hidden">
                          <GripVertical className="w-3 h-3 opacity-60" />
                          <span className="truncate">{clip.name}</span>
                        </div>
                      </div>
                  ));
                })}


                {/* Playhead */}
                <div
                  className="absolute top-0 w-0.5 bg-red-500 z-20 pointer-events-none inset-y-0"
                  style={{
                    left: `${Math.min((currentTime / totalContentDuration) * 100, 100)}%`
                  }}
                  data-testid="timeline-playhead"
                />
              </div>
          </div>
        </div>
      </ScrollArea>
  );
}
