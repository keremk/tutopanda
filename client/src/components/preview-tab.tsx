import { useMemo } from "react";
import LazyVideoPreview from "./lazy-video-preview";
import EditorLayout from "./editor-layout";
import VideoCommandBar from "./video-command-bar";
import { useLectureEditor } from "./lecture-editor-provider";
import type { Timeline, TimelineTrackKey, aspectRatioValues } from "@/types/types";

interface PreviewTabProps {
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
  aspectRatio?: typeof aspectRatioValues[number];
}

export default function PreviewTab({
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onRemoveClip,
  onUpdateClip,
  aspectRatio,
}: PreviewTabProps) {
  const { timeline, lectureId } = useLectureEditor();

  const createEmptyTimeline = useMemo(() => {
    return () => ({
      id: `timeline-${lectureId}`,
      name: "Untitled timeline",
      duration: 0,
      tracks: {
        visual: [],
        voice: [],
        music: [],
        soundEffects: [],
      },
    });
  }, [lectureId]);

  const fallbackTimeline = useMemo<Timeline>(() => createEmptyTimeline(), [createEmptyTimeline]);
  const activeTimeline = timeline ?? fallbackTimeline;

  return (
    <EditorLayout
      currentTime={currentTime}
      isPlaying={isPlaying}
      onPlay={onPlay}
      onPause={onPause}
      onSeek={onSeek}
      onRemoveClip={onRemoveClip}
      onUpdateClip={onUpdateClip}
    >
      <VideoCommandBar />
      <LazyVideoPreview
        timeline={activeTimeline}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onSeek={onSeek}
        onPlay={onPlay}
        onPause={onPause}
        aspectRatio={aspectRatio}
      />
    </EditorLayout>
  );
}
