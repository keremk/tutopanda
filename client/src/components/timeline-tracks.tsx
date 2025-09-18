import React, { useRef, useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Trash2, GripVertical, Film, Mic, Music, Volume2 } from 'lucide-react';
import { type Timeline, type TimelineComponent } from '@/schema';
import { cn } from '@/lib/utils';

interface TimelineChannel {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  height: number;
  componentTypes: string[];
}

const TIMELINE_CHANNELS: TimelineChannel[] = [
  {
    id: 'clips',
    name: 'Video Clips',
    icon: Film,
    height: 48,
    componentTypes: ['ken_burns', 'map_troop_movement'],
  },
  {
    id: 'voice',
    name: 'Voice & Narration',
    icon: Mic,
    height: 48,
    componentTypes: ['voice'],
  },
  {
    id: 'music',
    name: 'Background Music',
    icon: Music,
    height: 48,
    componentTypes: ['background_music'],
  },
  {
    id: 'sfx',
    name: 'Sound Effects',
    icon: Volume2,
    height: 48,
    componentTypes: ['sound_effect'],
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
  onRemoveComponent: (id: string) => void;
  onUpdateComponent: (id: string, updates: { startTime?: number; duration?: number }) => void;
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
  onRemoveComponent,
  onUpdateComponent,
  className,
}: TimelineTracksProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    dragType: 'resize-start' | 'resize-end' | null;
    componentId: string | null;
    startX: number;
    startTime: number;
    originalDuration?: number;
  }>({ isDragging: false, dragType: null, componentId: null, startX: 0, startTime: 0 });

  const channelHeight = 48;
  const totalTimelineHeight = TIMELINE_CHANNELS.length * channelHeight;

  const getChannelForComponent = (componentType: string): TimelineChannel => {
    return TIMELINE_CHANNELS.find(channel =>
      channel.componentTypes.includes(componentType)
    ) || TIMELINE_CHANNELS[0]; // Default to clips channel
  };

  const getChannelIndex = (componentType: string): number => {
    const channel = getChannelForComponent(componentType);
    return TIMELINE_CHANNELS.findIndex(c => c.id === channel.id);
  };

  const getComponentStyle = (component: TimelineComponent) => {
    const leftPercent = (component.startTime / totalContentDuration) * 100;
    const widthPercent = (component.duration / totalContentDuration) * 100;
    const channelIndex = getChannelIndex(component.type);
    const top = channelIndex * channelHeight + 4; // 4px padding from channel edge

    return {
      left: `${leftPercent}%`,
      top: `${top}px`,
      width: `${Math.max(widthPercent, 0.5)}%`, // Minimum 0.5% width for visibility with longer timelines
      height: `${channelHeight - 8}px`, // Full channel height minus padding
    };
  };

  const getComponentColor = (type: string) => {
    switch (type) {
      case 'ken_burns':
        return 'bg-blue-600 hover:bg-blue-500';
      case 'map_troop_movement':
        return 'bg-green-600 hover:bg-green-500';
      default:
        return 'bg-gray-600 hover:bg-gray-500';
    }
  };

  const pixelsToTime = (pixels: number) => (pixels / pixelsPerSecond);

  const handleMouseDown = useCallback((e: React.MouseEvent, componentId: string, dragType: 'resize-start' | 'resize-end') => {
    e.preventDefault();
    e.stopPropagation();
    const component = timeline.components.find(c => c.id === componentId);
    if (!component || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const startX = e.clientX - rect.left;

    setDragState({
      isDragging: true,
      dragType,
      componentId,
      startX,
      startTime: component.startTime,
      originalDuration: component.duration,
    });
  }, [timeline.components]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging || !dragState.componentId || !timelineRef.current) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const deltaX = currentX - dragState.startX;
    const deltaTime = pixelsToTime(deltaX);

    const component = timeline.components.find(c => c.id === dragState.componentId);
    if (!component) return;

    let newStartTime = component.startTime;
    let newDuration = component.duration;

    switch (dragState.dragType) {
      case 'resize-start':
        const maxStartReduction = component.duration - 0.1;
        const startDelta = Math.max(-maxStartReduction, deltaTime);
        newStartTime = Math.max(0, dragState.startTime + startDelta);
        newDuration = (dragState.originalDuration || component.duration) - startDelta;
        break;
      case 'resize-end':
        newDuration = Math.max(0.1, (dragState.originalDuration || component.duration) + deltaTime);
        break;
    }

    if (newStartTime + newDuration > totalContentDuration && dragState.dragType !== 'resize-end') {
      newStartTime = totalContentDuration - newDuration;
    }

    onUpdateComponent(component.id, { startTime: newStartTime, duration: newDuration });
  }, [dragState, timeline.components, totalContentDuration, onUpdateComponent, pixelsToTime]);

  const handleMouseUp = useCallback(() => {
    setDragState({ isDragging: false, dragType: null, componentId: null, startX: 0, startTime: 0 });
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
          <div className="flex">
            {/* Channel Labels Column */}
            <div className="w-16 shrink-0 bg-background/80 border-r border-border/30">
              {TIMELINE_CHANNELS.map((channel) => {
                const IconComponent = channel.icon;
                return (
                  <Tooltip key={channel.id}>
                    <TooltipTrigger asChild>
                      <div
                        className="flex items-center justify-center hover:bg-muted/30 transition-colors"
                        style={{ height: `${channelHeight}px` }}
                      >
                        <IconComponent className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors" />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{channel.name}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>

            {/* Timeline Tracks */}
            <div className="flex-1 px-2">
              <div
                className="w-full"
                style={{
                  height: `${totalTimelineHeight}px`,
                  overflowX: needsHorizontalScroll ? 'auto' : 'hidden',
                  overflowY: 'hidden',
                }}
              >
                <div
                  ref={timelineRef}
                  className="relative cursor-pointer select-none"
                  style={{
                    height: `${totalTimelineHeight}px`,
                    width: needsHorizontalScroll ? `${effectiveWidth}px` : '100%',
                    minWidth: needsHorizontalScroll ? `${effectiveWidth}px` : 'auto'
                  }}
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

                {/* Component blocks */}
                {timeline.components
                  .sort((a, b) => a.startTime - b.startTime)
                  .map((component) => (
                    <div
                      key={component.id}
                      className={`absolute rounded ${getComponentColor(component.type)} transition-all group border border-white/20`}
                      style={getComponentStyle(component)}
                      data-testid={`timeline-component-${component.id}`}
                    >
                      {/* Resize handle - start */}
                      <div
                        className="absolute left-0 top-0 w-2 h-full bg-white/20 hover:bg-white/40 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, component.id, 'resize-start');
                        }}
                        data-testid={`resize-start-${component.id}`}
                      />

                      {/* Component content */}
                      <div className="flex items-center justify-between px-2 h-full text-white text-xs overflow-hidden">
                        <div className="flex items-center gap-1 flex-1 min-w-0">
                          <GripVertical className="w-3 h-3 opacity-60" />
                          <span className="truncate">{component.name}</span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 ml-1 text-white hover:bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveComponent(component.id);
                          }}
                          data-testid={`button-remove-${component.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>

                      {/* Resize handle - end */}
                      <div
                        className="absolute right-0 top-0 w-2 h-full bg-white/20 hover:bg-white/40 cursor-ew-resize opacity-0 group-hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          handleMouseDown(e, component.id, 'resize-end');
                        }}
                        data-testid={`resize-end-${component.id}`}
                      />
                    </div>
                ))}


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
        </div>
        </div>
      </ScrollArea>
  );
}