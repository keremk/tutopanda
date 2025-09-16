import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Play, Pause, Download, Plus, Trash2 } from 'lucide-react';
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
  onExport: () => void;
}

export default function TimelineEditor({
  timeline,
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onAddComponent,
  onRemoveComponent,
  onExport,
}: TimelineEditorProps) {
  const timelineWidth = 800;
  const pixelsPerSecond = timelineWidth / timeline.duration;

  const getComponentStyle = (component: TimelineComponent) => {
    const left = component.startTime * pixelsPerSecond;
    const width = component.duration * pixelsPerSecond;
    return {
      left: `${left}px`,
      width: `${width}px`,
    };
  };

  const getComponentColor = (type: string) => {
    switch (type) {
      case 'ken_burns':
        return 'bg-blue-600';
      case 'map_troop_movement':
        return 'bg-green-600';
      default:
        return 'bg-gray-600';
    }
  };

  const playheadPosition = (currentTime / timeline.duration) * timelineWidth;

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Timeline Editor</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddComponent('ken_burns')}
              data-testid="button-add-ken-burns"
            >
              <Plus className="w-4 h-4 mr-1" />
              Ken Burns
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAddComponent('map_troop_movement')}
              data-testid="button-add-map"
            >
              <Plus className="w-4 h-4 mr-1" />
              Map
            </Button>
            <Button
              onClick={onExport}
              data-testid="button-export"
              className="bg-primary hover:bg-primary/90"
            >
              <Download className="w-4 h-4 mr-1" />
              Export MP4
            </Button>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Controls */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            size="icon"
            onClick={isPlaying ? onPause : onPlay}
            data-testid="button-play-pause"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <div className="text-sm font-mono">
            {currentTime.toFixed(1)}s / {timeline.duration}s
          </div>
        </div>

        {/* Timeline Scrubber */}
        <div className="space-y-2">
          <Slider
            value={[currentTime]}
            max={timeline.duration}
            step={0.1}
            onValueChange={([value]) => onSeek(value)}
            className="w-full"
            data-testid="slider-timeline"
          />
          
          {/* Timeline Visual */}
          <div className="relative bg-muted rounded-lg p-4" style={{ height: '120px' }}>
            {/* Time markers */}
            <div className="absolute top-0 left-4 right-4 flex justify-between text-xs text-muted-foreground">
              {Array.from({ length: Math.ceil(timeline.duration) + 1 }, (_, i) => (
                <span key={i} className="w-8 text-center">
                  {i}s
                </span>
              ))}
            </div>
            
            {/* Component blocks */}
            <div className="relative mt-6" style={{ width: `${timelineWidth}px`, height: '60px', margin: '0 auto' }}>
              {timeline.components.map((component) => (
                <div
                  key={component.id}
                  className={`absolute top-0 h-12 rounded ${getComponentColor(component.type)} flex items-center justify-between px-2 text-white text-xs`}
                  style={getComponentStyle(component)}
                  data-testid={`timeline-component-${component.id}`}
                >
                  <span className="truncate flex-1">{component.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-1 text-white hover:bg-white/20"
                    onClick={() => onRemoveComponent(component.id)}
                    data-testid={`button-remove-${component.id}`}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              ))}
              
              {/* Playhead */}
              <div
                className="absolute top-0 w-0.5 h-12 bg-red-500 z-10"
                style={{ left: `${playheadPosition}px` }}
                data-testid="timeline-playhead"
              />
            </div>
          </div>
        </div>

        {/* Component Details */}
        <div className="text-sm text-muted-foreground">
          Components: {timeline.components.length} | Duration: {timeline.duration}s
        </div>
      </CardContent>
    </Card>
  );
}