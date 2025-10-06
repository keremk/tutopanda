import React, { useState, useEffect } from 'react';
import { TrackHeaders } from '@/components/track-headers';
import { TimelineContent } from '@/components/timeline-content';
import { calculateTimelineMetrics } from '@/lib/timeline-utils';
import { type Timeline, type TimelineTrackKey } from '@/types/types';

interface TimelineEditorContentProps {
  timeline: Timeline;
  currentTime: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onRemoveClip: (track: TimelineTrackKey, id: string) => void;
  onUpdateClip: (
    track: TimelineTrackKey,
    id: string,
    updates: { startTime?: number; duration?: number }
  ) => void;
  onClipSelect?: (track: TimelineTrackKey, clipId: string) => void;
}

export default function TimelineEditorContent({
  timeline,
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onRemoveClip,
  onUpdateClip,
  onClipSelect,
}: TimelineEditorContentProps) {
  const [timelineWidth, setTimelineWidth] = useState(800);

  // Calculate timeline metrics using utils
  const metrics = calculateTimelineMetrics(timeline, timelineWidth);

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
        <TrackHeaders
          isPlaying={isPlaying}
          onPlay={onPlay}
          onPause={onPause}
        />
        <TimelineContent
          timeline={timeline}
          currentTime={currentTime}
          totalContentDuration={metrics.totalContentDuration}
          needsHorizontalScroll={metrics.needsHorizontalScroll}
          effectiveWidth={metrics.effectiveWidth}
          pixelsPerSecond={metrics.pixelsPerSecond}
          onSeek={onSeek}
          onRemoveClip={onRemoveClip}
          onUpdateClip={onUpdateClip}
          onClipSelect={onClipSelect}
        />
      </div>
    </div>
  );
}
