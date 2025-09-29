import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import VideoPreviewContent from "./video-preview-content";
import TimelineEditorContent from "./timeline-editor-content";
import { useLectureEditor } from "@/components/lecture-editor-provider";
import type {
  Timeline,
  KenBurnsClip,
  TimelineTrackKey,
  TimelineTracks,
} from "@/types/types";

export default function VideoPreview() {
  const {
    lectureId,
    timeline,
    updateTimeline,
  } = useLectureEditor();
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

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

  // Auto-pause when reaching end - now handled by the Player
  useEffect(() => {
    if (currentTime >= activeTimeline.duration) {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [currentTime, activeTimeline.duration]);

  const handlePlay = () => {
    setIsPlaying(true);
    console.log("▶️ Playback started");
  };

  const handlePause = () => {
    setIsPlaying(false);
    console.log("⏸️ Playback paused");
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    console.log("⏭️ Seeked to:", time.toFixed(1) + "s");
  };

  const ensureTimeline = (value: Timeline | null | undefined): Timeline => {
    if (!value) {
      return createEmptyTimeline();
    }

    return {
      ...value,
      tracks: {
        visual: value.tracks?.visual ?? [],
        voice: value.tracks?.voice ?? [],
        music: value.tracks?.music ?? [],
        soundEffects: value.tracks?.soundEffects ?? [],
      },
    };
  };

  const recomputeDuration = (tracks: TimelineTracks) => {
    const clips = Object.values(tracks).flatMap((list) =>
      list.map((clip) => clip.startTime + clip.duration)
    );
    return clips.length > 0 ? Math.max(...clips) : 0;
  };

  const handleAddVisualClip = () => {
    const visualClips = activeTimeline.tracks?.visual ?? [];
    const nextStartTime = visualClips.length > 0
      ? Math.max(...visualClips.map((clip) => clip.startTime + clip.duration))
      : activeTimeline.duration;

    const newClip: KenBurnsClip = {
      id: `kb-${Date.now()}`,
      name: `Ken Burns ${visualClips.length + 1}`,
      kind: "kenBurns",
      startTime: nextStartTime,
      duration: 5,
      imageAssetId: undefined,
      imageUrl:
        "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=800&fit=crop",
      startScale: 1,
      endScale: 1.2,
      startX: 0,
      startY: 0,
      endX: -30,
      endY: -20,
    };

    updateTimeline((previous) => {
      const base = ensureTimeline(previous);
      const tracks = {
        ...base.tracks,
        visual: [...base.tracks.visual, newClip],
      };
      return {
        ...base,
        tracks,
        duration: recomputeDuration(tracks),
      };
    });
    console.log("➕ Added visual clip:", newClip.name);
  };

  const handleRemoveClip = (track: TimelineTrackKey, id: string) => {
    updateTimeline((previous) => {
      const base = ensureTimeline(previous);
      const clips = base.tracks[track] ?? [];
      const clipToRemove = clips.find((clip) => clip.id === id);
      const updatedClips = clips.filter((clip) => clip.id !== id);
      const tracks = {
        ...base.tracks,
        [track]: updatedClips,
      };

      console.log(`❌ Removed clip: ${clipToRemove?.name ?? id}`);

      return {
        ...base,
        tracks,
        duration: recomputeDuration(tracks),
      };
    });
  };

  const handleUpdateClip = (
    track: TimelineTrackKey,
    id: string,
    updates: { startTime?: number; duration?: number }
  ) => {
    updateTimeline((previous) => {
      const base = ensureTimeline(previous);
      const clips = base.tracks[track] ?? [];
      const updatedClips = clips.map((clip) =>
        clip.id === id ? { ...clip, ...updates } : clip
      );
      const tracks = {
        ...base.tracks,
        [track]: updatedClips,
      };

      console.log(`🔄 Updated clip ${id}:`, updates);

      return {
        ...base,
        tracks,
        duration: recomputeDuration(tracks),
      };
    });
  };

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Video Preview</h2>
        <div className="flex gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAddVisualClip}
            data-testid="button-add-ken-burns"
          >
            <Plus className="w-4 h-4 mr-1" />
            Ken Burns
          </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-4 min-h-0">
        {/* Player section */}
        <div className="flex-1 min-h-0">
          <VideoPreviewContent
            timeline={activeTimeline}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onSeek={handleSeek}
            onPlay={handlePlay}
            onPause={handlePause}
          />
        </div>

        {/* Timeline section */}
        <div className="h-80 min-h-0">
          <TimelineEditorContent
            timeline={activeTimeline}
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRemoveClip={handleRemoveClip}
            onUpdateClip={handleUpdateClip}
          />
        </div>
      </div>
    </>
  );
}
