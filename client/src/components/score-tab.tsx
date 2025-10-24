import BackgroundScoreEditor from "./background-score-editor";
import EditorLayout from "./editor-layout";
import type { TimelineTrackKey } from "@/types/types";

interface ScoreTabProps {
  currentTime: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  selectedClipId: string | null;
}

export default function ScoreTab({
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  selectedClipId,
}: ScoreTabProps) {
  return (
    <EditorLayout
      currentTime={currentTime}
      isPlaying={isPlaying}
      onPlay={onPlay}
      onPause={onPause}
      onSeek={onSeek}
    >
      <BackgroundScoreEditor
        selectedClipId={selectedClipId}
        currentTime={currentTime}
        isPlaying={isPlaying}
        onSeek={onSeek}
      />
    </EditorLayout>
  );
}
