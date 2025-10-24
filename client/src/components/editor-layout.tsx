import TimelineEditorContent from "./timeline-editor-content";
import { useLectureEditor } from "./lecture-editor-provider";
import { useAgentPanelContext } from "@/hooks/use-agent-panel";
import type { Timeline, TimelineTrackKey } from "@/types/types";

interface EditorLayoutProps {
  currentTime: number;
  isPlaying: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (time: number) => void;
  children: React.ReactNode;
}

export default function EditorLayout({
  currentTime,
  isPlaying,
  onPlay,
  onPause,
  onSeek,
  children,
}: EditorLayoutProps) {
  const { timeline } = useLectureEditor();
  const { handleTimelineClipSelect } = useAgentPanelContext();

  const handleClipSelect = (track: TimelineTrackKey, clipId: string) => {
    // Only handle visual, voice, and music tracks
    if (track === 'visual' || track === 'voice' || track === 'music') {
      handleTimelineClipSelect(track, clipId);
    }
  };

  const createEmptyTimeline = (): Timeline => ({
    id: `timeline-empty`,
    name: "Untitled timeline",
    duration: 0,
    tracks: {
      visual: [],
      voice: [],
      music: [],
      soundEffects: [],
    },
  });

  const activeTimeline = timeline ?? createEmptyTimeline();

  return (
    <div className="flex-1 flex flex-col gap-4 min-h-0 overflow-hidden">
      {/* Editor section - constrained height */}
      <div className="flex-shrink-0 overflow-hidden" style={{ height: "min(60vh, calc(100% - 18rem))" }}>
        {children}
      </div>

      {/* Timeline section - fixed height */}
      <div className="h-75 flex-shrink-0">
        <TimelineEditorContent
          timeline={activeTimeline}
          currentTime={currentTime}
          isPlaying={isPlaying}
          onPlay={onPlay}
          onPause={onPause}
          onSeek={onSeek}
          onClipSelect={handleClipSelect}
        />
      </div>
    </div>
  );
}
