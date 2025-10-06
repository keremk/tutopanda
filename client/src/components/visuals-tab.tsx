import VisualsEditor from "./visuals-editor";
import EditorLayout from "./editor-layout";
import type { TimelineTrackKey } from "@/types/types";

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
      <VisualsEditor selectedClipId={selectedClipId} />
    </EditorLayout>
  );
}
