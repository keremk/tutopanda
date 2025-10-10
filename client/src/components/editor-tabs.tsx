"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgentPanelContext, type AgentPanelTab } from "@/hooks/use-agent-panel";
import PreviewTab from "./preview-tab";
import NarrationTab from "./narration-tab";
import VisualsTab from "./visuals-tab";
import ScoreTab from "./score-tab";
import EditConfiguration from "./edit-configuration";
import SegmentAudioPlayer from "./segment-audio-player";
import { useLectureEditor } from "./lecture-editor-provider";
import type {
  Timeline,
  TimelineTrackKey,
  TimelineTracks,
  VoiceClip,
} from "@/types/types";

export default function EditorTabs() {
  const { activeTab, setActiveTab, configEditState, handleConfigEditComplete, timelineSelection, handleTimelineClipSelect } = useAgentPanelContext();
  const { lectureId, timeline, updateTimeline, content, updatedAt } = useLectureEditor();

  // Playback state - lifted from preview-tab
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Segment playback mode detection
  const isNarrationSegmentMode = activeTab === 'narration' && timelineSelection?.trackType === 'voice' && timelineSelection?.clipId !== null;
  const selectedNarrationClip = useMemo(() => {
    if (!isNarrationSegmentMode || !timeline) return null;
    return timeline.tracks.voice.find((c) => c.id === timelineSelection?.clipId) as VoiceClip | undefined;
  }, [isNarrationSegmentMode, timeline, timelineSelection?.clipId]);

  const narrationAsset = useMemo(() => {
    if (!selectedNarrationClip?.narrationAssetId || !content.narration) return null;
    return content.narration.find((n) => n.id === selectedNarrationClip.narrationAssetId);
  }, [selectedNarrationClip, content.narration]);

  // Use config from edit state if available (user clicked Edit in agent progress)
  // Otherwise use config from content (normal configuration tab)
  const config = configEditState?.config ?? content.config;
  const runId = configEditState?.runId ?? null;
  const isEditMode = configEditState !== null;

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

  // Auto-pause when reaching end
  useEffect(() => {
    if (currentTime >= activeTimeline.duration) {
      setIsPlaying(false);
      setCurrentTime(0);
    }
  }, [currentTime, activeTimeline.duration]);

  const handlePlay = useCallback(() => {
    // If in narration segment mode, jump to segment start
    if (isNarrationSegmentMode && selectedNarrationClip) {
      setCurrentTime(selectedNarrationClip.startTime);
      console.log("▶️ Segment playback started at:", selectedNarrationClip.startTime);
    } else {
      console.log("▶️ Playback started");
    }
    setIsPlaying(true);
  }, [isNarrationSegmentMode, selectedNarrationClip]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    console.log("⏸️ Playback paused");
  }, []);

  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    console.log("⏭️ Seeked to:", time.toFixed(1) + "s");
  }, []);

  // Handle segment end (for looping)
  const handleSegmentEnd = useCallback(() => {
    if (selectedNarrationClip && isPlaying) {
      console.log("🔄 Looping segment from:", selectedNarrationClip.startTime);
      setCurrentTime(selectedNarrationClip.startTime);
    }
  }, [selectedNarrationClip, isPlaying]);

  const ensureTimeline = useCallback((value: Timeline | null | undefined): Timeline => {
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
  }, [createEmptyTimeline]);

  const recomputeDuration = useCallback((tracks: TimelineTracks) => {
    const clips = Object.values(tracks).flatMap((list) =>
      list.map((clip) => clip.startTime + clip.duration)
    );
    return clips.length > 0 ? Math.max(...clips) : 0;
  }, []);

  const handleRemoveClip = useCallback((track: TimelineTrackKey, id: string) => {
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
  }, [updateTimeline, ensureTimeline, recomputeDuration]);

  const handleUpdateClip = useCallback((
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
  }, [updateTimeline, ensureTimeline, recomputeDuration]);

  // Get selected clip ID based on timeline selection
  const selectedClipId = timelineSelection?.clipId ?? null;

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      {/* Segment Audio Player - Hidden, controlled by timeline */}
      {isNarrationSegmentMode && selectedNarrationClip && narrationAsset?.sourceUrl && (
        <SegmentAudioPlayer
          audioUrl={`/api/storage/${narrationAsset.sourceUrl}?v=${updatedAt.getTime()}`}
          segmentStartTime={selectedNarrationClip.startTime}
          segmentDuration={selectedNarrationClip.duration}
          isPlaying={isPlaying}
          currentTime={currentTime}
          onTimeUpdate={setCurrentTime}
          onSegmentEnd={handleSegmentEnd}
        />
      )}

      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AgentPanelTab)}
        className="h-full flex flex-col"
      >
        <div className="shrink-0 px-6 pt-6">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="video-preview">Video Preview</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="narration">Narration</TabsTrigger>
            <TabsTrigger value="visuals">Visuals</TabsTrigger>
            <TabsTrigger value="score">Score</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="configuration"
          className="flex-1 p-6 mt-0 overflow-hidden"
        >
          <EditConfiguration
            config={config}
            runId={runId}
            isEditMode={isEditMode}
            onConfigEditComplete={handleConfigEditComplete}
          />
        </TabsContent>

        <TabsContent
          value="video-preview"
          className="flex-1 flex flex-col p-6 mt-0 min-h-0"
        >
          <PreviewTab
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRemoveClip={handleRemoveClip}
            onUpdateClip={handleUpdateClip}
            aspectRatio={content.config?.image?.aspectRatio}
          />
        </TabsContent>

        <TabsContent value="narration" className="flex-1 flex flex-col p-6 mt-0 min-h-0">
          <NarrationTab
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRemoveClip={handleRemoveClip}
            onUpdateClip={handleUpdateClip}
            selectedClipId={selectedClipId}
          />
        </TabsContent>

        <TabsContent value="visuals" className="flex-1 flex flex-col p-6 mt-0 min-h-0">
          <VisualsTab
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRemoveClip={handleRemoveClip}
            onUpdateClip={handleUpdateClip}
            selectedClipId={selectedClipId}
          />
        </TabsContent>

        <TabsContent value="score" className="flex-1 flex flex-col p-6 mt-0 min-h-0">
          <ScoreTab
            currentTime={currentTime}
            isPlaying={isPlaying}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRemoveClip={handleRemoveClip}
            onUpdateClip={handleUpdateClip}
            selectedClipId={selectedClipId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
