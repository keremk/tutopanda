import React, { useState, useEffect } from 'react';
import { TrackHeaders } from '@/components/track-headers';
import { TimelineContent } from '@/components/timeline-content';
import { calculateTimelineMetrics } from '@/lib/timeline-utils';
import { type Timeline } from '@/schema';

interface TimelineEditorContentProps {
  timeline: Timeline;
  currentTime: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onAddComponent: (type: 'ken_burns' | 'map_troop_movement') => void;
  onRemoveComponent: (id: string) => void;
  onUpdateComponent: (id: string, updates: { startTime?: number; duration?: number }) => void;
}

export default function TimelineEditorContent({
  timeline,
  currentTime,
  onSeek,
  onRemoveComponent,
  onUpdateComponent,
}: TimelineEditorContentProps) {
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
    <div className="h-full flex flex-col pb-4" data-timeline-container>
      {/* Composed Timeline: TrackHeaders + ScrollableContent */}
      <div className="bg-muted rounded-lg overflow-hidden flex flex-1">
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
    </div>
  );
}