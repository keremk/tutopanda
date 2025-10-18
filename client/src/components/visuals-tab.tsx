import { useMemo } from "react";
import VisualsEditor from "./visuals-editor";
import VideoSegmentEditor from "./video-segment-editor";
import EditorLayout from "./editor-layout";
import type { TimelineTrackKey, VisualClip } from "@/types/types";
import { useLectureEditor } from "./lecture-editor-provider";

interface VisualsTabProps {
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
  selectedClipId: string | null;
}

export default function VisualsTab({
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onRemoveClip,
  onUpdateClip,
  selectedClipId,
}: VisualsTabProps) {
  const { timeline } = useLectureEditor();

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    return (timeline?.tracks.visual.find((clip) => clip.id === selectedClipId) as VisualClip | undefined) ?? null;
  }, [timeline, selectedClipId]);

  const isVideoClip = selectedClip?.kind === "video";
  const kenBurnsClipId = isVideoClip ? null : selectedClipId;
  const videoClipId = isVideoClip ? selectedClipId : null;

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
      {isVideoClip ? (
        <VideoSegmentEditor selectedClipId={videoClipId} />
      ) : (
        <VisualsEditor selectedClipId={kenBurnsClipId} />
      )}
    </EditorLayout>
  );
}
