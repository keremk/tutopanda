import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrackHeaders } from '@/components/track-headers';
import { TimelineContent } from '@/components/timeline-content';
import { calculateTimelineMetrics } from '@/lib/timeline-utils';
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



export default function InteractiveTimelineEditor({
  timeline,
  currentTime,
  onSeek,
  onAddComponent,
  onRemoveComponent,
  onUpdateComponent,
}: TimelineEditorProps) {
  const [timelineWidth, setTimelineWidth] = useState(800);

  // Calculate timeline metrics using utils
  const metrics = calculateTimelineMetrics(timeline.components, timelineWidth);

  // Update timeline width based on available space
  useEffect(() => {
    const updateWidth = () => {
      const container = document.querySelector('[data-timeline-container]');
      if (container) {
        const availableWidth = container.clientWidth - 40; // margin
        setTimelineWidth(Math.max(400, availableWidth));
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);
  

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
      <CardContent className="flex-1 flex flex-col min-h-0" data-timeline-container>
        {/* Composed Timeline: TrackHeaders + ScrollableContent */}
        <div className="bg-muted rounded-lg overflow-hidden flex">
          <TrackHeaders />
          <TimelineContent
            timeline={timeline}
            currentTime={currentTime}
            totalContentDuration={metrics.totalContentDuration}
            needsHorizontalScroll={metrics.needsHorizontalScroll}
            effectiveWidth={metrics.effectiveWidth}
            pixelsPerSecond={metrics.pixelsPerSecond}
            onSeek={onSeek}
            onRemoveComponent={onRemoveComponent}
            onUpdateComponent={onUpdateComponent}
          />
        </div>
      </CardContent>
    </Card>
  );
}