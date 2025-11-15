import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Timeline, TimelineTrackKey } from "@/types/timeline";
import { calculateTimelineMetrics } from "@/lib/timeline-metrics";
import { TrackHeaders } from "./TrackHeaders";
import { TimelineContent } from "./TimelineContent";

interface TimelineEditorProps {
  timeline: Timeline;
  currentTime: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  onClipSelect?: (track: TimelineTrackKey, clipId: string) => void;
}

export const TimelineEditor = ({
  timeline,
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onClipSelect,
}: TimelineEditorProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [timelineWidth, setTimelineWidth] = useState(800);

  const updateWidth = useCallback(() => {
    if (!containerRef.current) {
      return;
    }
    const availableWidth = containerRef.current.clientWidth - 40;
    setTimelineWidth(Math.max(400, availableWidth));
  }, []);

  useEffect(() => {
    updateWidth();
    window.addEventListener("resize", updateWidth);
    return () => window.removeEventListener("resize", updateWidth);
  }, [updateWidth]);

  const metrics = useMemo(
    () => calculateTimelineMetrics(timeline, timelineWidth),
    [timeline, timelineWidth],
  );

  return (
    <div className="h-full flex flex-col pb-4" ref={containerRef}>
      <div className="bg-muted rounded-lg overflow-hidden flex flex-1 min-h-0">
        <TrackHeaders isPlaying={isPlaying} onPlay={onPlay} onPause={onPause} />
        <TimelineContent
          timeline={timeline}
          currentTime={currentTime}
          totalContentDuration={metrics.totalContentDuration}
          needsHorizontalScroll={metrics.needsHorizontalScroll}
          effectiveWidth={metrics.effectiveWidth}
          pixelsPerSecond={metrics.pixelsPerSecond}
          onSeek={onSeek}
          onClipSelect={onClipSelect}
        />
      </div>
    </div>
  );
};
