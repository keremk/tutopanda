import React from 'react';
import { TimelineSlider } from '@/components/timeline-slider';
import { TimelineTracks } from '@/components/timeline-tracks';
import { type Timeline, type TimelineTrackKey } from '@/types/types';

interface TimelineContentProps {
  timeline: Timeline;
  currentTime: number;
  totalContentDuration: number;
  needsHorizontalScroll: boolean;
  effectiveWidth: number;
  pixelsPerSecond: number;
  onSeek: (time: number) => void;
  onClipSelect?: (track: TimelineTrackKey, clipId: string) => void;
}

export function TimelineContent({
  timeline,
  currentTime,
  totalContentDuration,
  needsHorizontalScroll,
  effectiveWidth,
  pixelsPerSecond,
  onSeek,
  onClipSelect,
}: TimelineContentProps) {
  return (
    <div
      className="flex-1"
      style={{
        overflowX: 'scroll', // Always show horizontal scrollbar
        overflowY: 'hidden',
        scrollbarWidth: 'thin', // Firefox
      }}
    >
      <div
        style={{
          width: needsHorizontalScroll ? `${effectiveWidth}px` : '100%',
          minWidth: needsHorizontalScroll ? `${effectiveWidth}px` : 'auto'
        }}
      >
        <TimelineSlider
          currentTime={currentTime}
          totalContentDuration={totalContentDuration}
          needsHorizontalScroll={needsHorizontalScroll}
          effectiveWidth={effectiveWidth}
          onSeek={onSeek}
        />
        <TimelineTracks
          timeline={timeline}
          currentTime={currentTime}
          totalContentDuration={totalContentDuration}
          needsHorizontalScroll={needsHorizontalScroll}
          effectiveWidth={effectiveWidth}
          pixelsPerSecond={pixelsPerSecond}
          onSeek={onSeek}
          onClipSelect={onClipSelect}
        />
      </div>
    </div>
  );
}
