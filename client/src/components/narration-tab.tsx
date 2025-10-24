import NarrationEditor from "./narration-editor";
import EditorLayout from "./editor-layout";
import type { TimelineTrackKey } from "@/types/types";

interface NarrationTabProps {
  currentTime: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  selectedClipId: string | null;
}

export default function NarrationTab({
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  selectedClipId,
}: NarrationTabProps) {
  return (
    <EditorLayout
      currentTime={currentTime}
      isPlaying={isPlaying}
      onPlay={onPlay}
      onPause={onPause}
      onSeek={onSeek}
    >
      <NarrationEditor
        selectedClipId={selectedClipId}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onSeek={onSeek}
      />
    </EditorLayout>
  );
}
