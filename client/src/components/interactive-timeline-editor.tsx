import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { TimelineSlider } from '@/components/timeline-slider';
import { Play, Pause, Download, Plus, Trash2, GripVertical, Film, Mic, Music, Volume2 } from 'lucide-react';
import { type Timeline, type TimelineComponent } from '@/schema';

interface TimelineEditorProps {
  timeline: Timeline;
  currentTime: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onAddComponent: (type: 'ken_burns' | 'map_troop_movement') => void;
  onRemoveComponent: (id: string) => void;
  onUpdateComponent: (id: string, updates: { startTime?: number; duration?: number }) => void;
  onExport: () => void;
}

interface DragState {
  isDragging: boolean;
  dragType: 'move' | 'resize-start' | 'resize-end' | null;
  componentId: string | null;
  startX: number;
  startTime: number;
  originalDuration?: number;
}

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

export default function InteractiveTimelineEditor({
  timeline,
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onAddComponent,
  onRemoveComponent,
  onUpdateComponent,
  onExport,
}: TimelineEditorProps) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: null,
    componentId: null,
    startX: 0,
    startTime: 0,
  });
  

  const timelineRef = useRef<HTMLDivElement>(null);
  const [timelineWidth, setTimelineWidth] = useState(800);
  const minTimelineDuration = 60; // 1 minute minimum
  const actualDuration = Math.max(timeline.duration, minTimelineDuration);
  const pixelsPerSecond = actualDuration > 0 ? timelineWidth / actualDuration : timelineWidth / minTimelineDuration;
  const snapThreshold = 0.5; // seconds
  const channelHeight = 48;
  const totalTimelineHeight = TIMELINE_CHANNELS.length * channelHeight;

  // Update timeline width based on available space
  useEffect(() => {
    const updateWidth = () => {
      if (timelineRef.current?.parentElement) {
        const availableWidth = timelineRef.current.parentElement.clientWidth - 20; // 20px margin
        setTimelineWidth(Math.max(400, availableWidth)); // minimum 400px
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

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
    const leftPercent = (component.startTime / actualDuration) * 100;
    const widthPercent = (component.duration / actualDuration) * 100;
    const channelIndex = getChannelIndex(component.type);
    const top = channelIndex * channelHeight + 4; // 4px padding from channel edge

    return {
      left: `${leftPercent}%`,
      top: `${top}px`,
      width: `${Math.max(widthPercent, 2)}%`, // Minimum 2% width for visibility
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

  const playheadPosition = currentTime * pixelsPerSecond;

  const pixelsToTime = (pixels: number) => (pixels / pixelsPerSecond);
  
  const snapToNearbyComponent = (time: number, excludeId: string) => {
    const otherComponents = timeline.components.filter(c => c.id !== excludeId);
    
    for (const component of otherComponents) {
      const startDiff = Math.abs(time - component.startTime);
      const endDiff = Math.abs(time - (component.startTime + component.duration));
      
      if (startDiff < snapThreshold) {
        return component.startTime;
      }
      if (endDiff < snapThreshold) {
        return component.startTime + component.duration;
      }
    }
    
    return Math.max(0, Math.min(time, timeline.duration));
  };

  const handleMouseDown = useCallback((e: React.MouseEvent, componentId: string, dragType: 'move' | 'resize-start' | 'resize-end') => {
    e.preventDefault();
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
      case 'move':
        newStartTime = snapToNearbyComponent(dragState.startTime + deltaTime, component.id);
        break;
      case 'resize-start':
        const maxStartReduction = component.duration - 0.1; // Minimum duration 0.1s
        const startDelta = Math.max(-maxStartReduction, deltaTime);
        newStartTime = Math.max(0, dragState.startTime + startDelta);
        newDuration = (dragState.originalDuration || component.duration) - startDelta;
        break;
      case 'resize-end':
        newDuration = Math.max(0.1, (dragState.originalDuration || component.duration) + deltaTime);
        break;
    }

    // Ensure component doesn't go beyond timeline bounds
    if (newStartTime + newDuration > timeline.duration && dragState.dragType !== 'resize-end') {
      newStartTime = timeline.duration - newDuration;
    }

    onUpdateComponent(component.id, { startTime: newStartTime, duration: newDuration });
  }, [dragState, timeline.components, timeline.duration, onUpdateComponent, pixelsToTime, snapToNearbyComponent]);

  const handleMouseUp = useCallback(() => {
    setDragState({
      isDragging: false,
      dragType: null,
      componentId: null,
      startX: 0,
      startTime: 0,
    });
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
    if (dragState.isDragging) return;
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelsToTime(x);
    onSeek(Math.max(0, Math.min(time, timeline.duration)));
  };

  return (
    <Card className="w-full h-full flex flex-col">
      <CardHeader className="shrink-0">
        <CardTitle className="flex items-center justify-between">
          <span>Timeline Editor</span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onAddComponent('ken_burns')}
              data-testid="button-add-ken-burns"
            >
              <Plus className="w-4 h-4 mr-1" />
              Ken Burns
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onAddComponent('map_troop_movement')}
              data-testid="button-add-map"
            >
              <Plus className="w-4 h-4 mr-1" />
              Map
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col space-y-4 min-h-0 overflow-auto">
          
          {/* Timeline Visual */}
          <div className="bg-muted rounded-lg overflow-hidden" style={{ height: `${totalTimelineHeight + 60}px` }}>
            <ScrollArea className="h-full">
              <div className="relative p-4">
                {/* TimelineSlider - includes markers, ticks, and draggable circle */}
                <div className="flex">
                  {/* Spacer for icon column */}
                  <div className="w-16 shrink-0"></div>
                  {/* TimelineSlider aligned with tracks */}
                  <div className="flex-1 px-2">
                    <TimelineSlider
                      currentTime={currentTime}
                      duration={actualDuration}
                      onSeek={onSeek}
                    />
                  </div>
                </div>

                <div className="flex mt-2">
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

                      {/* Component blocks */}
                      {timeline.components
                        .sort((a, b) => a.startTime - b.startTime)
                        .map((component) => (
                          <div
                            key={component.id}
                            className={`absolute rounded ${getComponentColor(component.type)} ${dragState.componentId === component.id ? 'opacity-80 shadow-lg' : ''} transition-all cursor-move group border border-white/20`}
                            style={getComponentStyle(component)}
                            data-testid={`timeline-component-${component.id}`}
                            onMouseDown={(e) => handleMouseDown(e, component.id, 'move')}
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
              
                      {/* Snap guides */}
                      {dragState.isDragging && (
                        <div className="absolute inset-0 pointer-events-none">
                          {timeline.components
                            .filter(c => c.id !== dragState.componentId)
                            .map(component => (
                              <React.Fragment key={`snap-${component.id}`}>
                                <div
                                  className="absolute w-0.5 bg-yellow-400/50 inset-y-0"
                                  style={{
                                    left: `${(component.startTime / actualDuration) * 100}%`
                                  }}
                                />
                                <div
                                  className="absolute w-0.5 bg-yellow-400/50 inset-y-0"
                                  style={{
                                    left: `${((component.startTime + component.duration) / actualDuration) * 100}%`
                                  }}
                                />
                              </React.Fragment>
                            ))}
                        </div>
                      )}

                      {/* Playhead */}
                      <div
                        className="absolute top-0 w-0.5 bg-red-500 z-20 pointer-events-none inset-y-0"
                        style={{
                          left: `${Math.min((currentTime / actualDuration) * 100, 100)}%`
                        }}
                        data-testid="timeline-playhead"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
      </CardContent>
    </Card>
  );
}