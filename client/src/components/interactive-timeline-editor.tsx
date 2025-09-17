import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TimelineSlider } from '@/components/timeline-slider';
import { TimelineTracks } from '@/components/timeline-tracks';
import { Plus } from 'lucide-react';
import { type Timeline } from '@/schema';

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


export default function InteractiveTimelineEditor({
  timeline,
  currentTime,
  onSeek,
  onAddComponent,
  onRemoveComponent,
  onUpdateComponent,
}: TimelineEditorProps) {
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    dragType: null,
    componentId: null,
    startX: 0,
    startTime: 0,
  });
  

  const minTimelineDuration = 60;
  const actualDuration = Math.max(timeline.duration, minTimelineDuration);

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
      <CardContent className="flex-1 flex flex-col space-y-4 min-h-0">
        {/* TimelineSlider - Fixed at top */}
        <div className="shrink-0">
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
        </div>

        {/* TimelineTracks with ScrollArea */}
        <div className="flex-1 min-h-0">
          <TimelineTracks
            timeline={timeline}
            currentTime={currentTime}
            dragState={dragState}
            setDragState={setDragState}
            onSeek={onSeek}
            onRemoveComponent={onRemoveComponent}
            onUpdateComponent={onUpdateComponent}
          />
        </div>
      </CardContent>
    </Card>
  );
}