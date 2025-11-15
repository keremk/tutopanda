import { TimelineSlider } from "./TimelineSlider";
import { TimelineTracks } from "./TimelineTracks";
import type { Timeline, TimelineTrackKey } from "@/types/timeline";

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

export const TimelineContent = ({
  timeline,
  currentTime,
  totalContentDuration,
  needsHorizontalScroll,
  effectiveWidth,
  pixelsPerSecond,
  onSeek,
  onClipSelect,
}: TimelineContentProps) => {
  return (
    <div
      className="flex-1"
      style={{
        overflowX: "scroll",
        overflowY: "hidden",
        scrollbarWidth: "thin",
      }}
    >
      <div
        style={{
          width: needsHorizontalScroll ? `${effectiveWidth}px` : "100%",
          minWidth: needsHorizontalScroll ? `${effectiveWidth}px` : "auto",
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
          pixelsPerSecond={pixelsPerSecond}
          onSeek={onSeek}
          onClipSelect={onClipSelect}
        />
      </div>
    </div>
  );
};
