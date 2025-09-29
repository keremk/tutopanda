import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Trash2, GripVertical, Film, Mic, Music, Volume2 } from 'lucide-react';
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
  onRemoveClip: (track: TimelineTrackKey, id: string) => void;
  onUpdateClip: (
    track: TimelineTrackKey,
    id: string,
    updates: { startTime?: number; duration?: number }
  ) => void;
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
  onRemoveClip,
  onUpdateClip,
  className,
}: TimelineTracksProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    dragType: 'resize-start' | 'resize-end' | null;
    clipId: string | null;
    track: TimelineTrackKey | null;
    startX: number;
    startTime: number;
    originalDuration?: number;
  }>({ isDragging: false, dragType: null, clipId: null, track: null, startX: 0, startTime: 0 });

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

  const getClipById = (track: TimelineTrackKey, clipId: string) => {
    return timeline.tracks?.[track]?.find((clip) => clip.id === clipId) ?? null;
  };

  const handleMouseDown = useCallback(
    (
      event: React.MouseEvent,
      track: TimelineTrackKey,
      clipId: string,
      dragType: 'resize-start' | 'resize-end'
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const clip = getClipById(track, clipId);
      if (!clip || !timelineRef.current) return;

      const rect = timelineRef.current.getBoundingClientRect();
      const startX = event.clientX - rect.left;

      setDragState({
        isDragging: true,
        dragType,
        clipId,
        track,
        startX,
        startTime: clip.startTime,
        originalDuration: clip.duration,
      });
    },
    [timeline]
  );

  const handleMouseMove = useCallback(
    (event: MouseEvent) => {
      if (!dragState.isDragging || !dragState.clipId || !dragState.track || !timelineRef.current) {
        return;
      }

      const rect = timelineRef.current.getBoundingClientRect();
      const currentX = event.clientX - rect.left;
      const deltaX = currentX - dragState.startX;
      const deltaTime = pixelsToTime(deltaX);

      const clip = getClipById(dragState.track, dragState.clipId);
      if (!clip) return;

      let newStartTime = clip.startTime;
      let newDuration = clip.duration;

      switch (dragState.dragType) {
        case 'resize-start': {
          const maxStartReduction = clip.duration - 0.1;
          const startDelta = Math.max(-maxStartReduction, deltaTime);
          newStartTime = Math.max(0, dragState.startTime + startDelta);
          newDuration = (dragState.originalDuration || clip.duration) - startDelta;
          break;
        }
        case 'resize-end': {
          newDuration = Math.max(0.1, (dragState.originalDuration || clip.duration) + deltaTime);
          break;
        }
      }

      if (newStartTime + newDuration > totalContentDuration && dragState.dragType !== 'resize-end') {
        newStartTime = totalContentDuration - newDuration;
      }

      onUpdateClip(dragState.track, dragState.clipId, {
        startTime: newStartTime,
        duration: newDuration,
      });
    },
    [dragState, onUpdateClip, pixelsToTime, totalContentDuration, timeline]
  );

  const handleMouseUp = useCallback(() => {
    setDragState({ isDragging: false, dragType: null, clipId: null, track: null, startX: 0, startTime: 0 });
  }, []);

  useEffect(() => {
    if (dragState.isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [dragState.isDragging, handleMouseMove, handleMouseUp]);


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
                          getClipColor(channel.id, clip.kind)
                        )}
                        style={getClipStyle(clip, channelIndex)}
                        data-testid={`timeline-clip-${clip.id}`}
                      >
                        {/* Resize handle - start */}
                        <div
                          className="absolute left-0 top-0 w-2 h-full bg-white/20 hover:bg-white/40 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            handleMouseDown(e, channel.id, clip.id, 'resize-start');
                          }}
                          data-testid={`resize-start-${clip.id}`}
                      />

                      {/* Component content */}
                      <div className="flex items-center justify-between px-2 h-full text-white text-xs overflow-hidden">
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <GripVertical className="w-3 h-3 opacity-60" />
                          <span className="truncate">{clip.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-1 text-white hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveClip(channel.id, clip.id);
                          }}
                          data-testid={`button-remove-${clip.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      {/* Resize handle - end */}
                      <div
                        className="absolute right-0 top-0 w-2 h-full bg-white/20 hover:bg-white/40 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, channel.id, clip.id, 'resize-end');
                        }}
                        data-testid={`resize-end-${clip.id}`}
                      />
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
