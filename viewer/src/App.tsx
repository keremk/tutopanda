import { useMemo, useState } from "react";
import { RemotionPreview } from "@/components/player/RemotionPreview";
import { TimelineEditor } from "@/components/timeline/TimelineEditor";
import { sampleTimeline } from "@/data/sample-timeline";
import type { Timeline } from "@/types/timeline";

const clampTime = (time: number, timeline: Timeline) => {
  const maxDuration = Math.max(timeline.duration, 1);
  return Math.max(0, Math.min(time, maxDuration));
};

function App() {
  const [timeline] = useState<Timeline>(sampleTimeline);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const safeCurrentTime = useMemo(
    () => clampTime(currentTime, timeline),
    [currentTime, timeline],
  );

  const handleSeek = (time: number) => {
    setCurrentTime(clampTime(time, timeline));
  };

  const handlePlay = () => setIsPlaying(true);
  const handlePause = () => setIsPlaying(false);

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <div className="rounded-3xl bg-card shadow-xl border border-border/60 p-6 flex flex-col gap-4 min-h-[75vh]">
          <header className="flex flex-col gap-1">
            <p className="text-sm uppercase tracking-[0.3em] text-muted-foreground">
              Remotion Viewer
            </p>
            <h1 className="text-3xl font-semibold">{timeline.name}</h1>
            <p className="text-muted-foreground">
              Inspect a generated timeline, scrub through clips, and preview the
              Remotion composition locally.
            </p>
          </header>
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div className="flex-shrink-0 overflow-hidden rounded-xl border border-border/40 bg-black/80 shadow-inner h-[360px]">
              <RemotionPreview
                timeline={timeline}
                currentTime={safeCurrentTime}
                isPlaying={isPlaying}
                onSeek={handleSeek}
                onPlay={handlePlay}
                onPause={handlePause}
              />
            </div>
            <div className="h-[360px]">
              <TimelineEditor
                timeline={timeline}
                currentTime={safeCurrentTime}
                isPlaying={isPlaying}
                onPlay={handlePlay}
                onPause={handlePause}
                onSeek={handleSeek}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
