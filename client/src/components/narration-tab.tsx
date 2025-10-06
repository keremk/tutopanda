import NarrationEditor from "./narration-editor";
import EditorLayout from "./editor-layout";
import type { TimelineTrackKey } from "@/types/types";

interface NarrationTabProps {
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

export default function NarrationTab({
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  onRemoveClip,
  onUpdateClip,
  selectedClipId,
}: NarrationTabProps) {
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
      <NarrationEditor selectedClipId={selectedClipId} />
    </EditorLayout>
  );
}
