"use client";

import { useState, useEffect, useTransition } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { MusicClip } from "@/types/types";
import { musicModelValues } from "@/types/types";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SegmentAudioPlayer from "./segment-audio-player";

interface BackgroundScoreEditorProps {
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

export default function BackgroundScoreEditor({
  selectedClipId,
  currentTime,
  isPlaying,
  onSeek
}: BackgroundScoreEditorProps) {
  const { timeline, content, lectureId, updatedAt } = useLectureEditor();
  const [isGenerating, startTransition] = useTransition();

  // Find the selected clip
  const selectedClip = timeline?.tracks.music.find(
    (clip) => clip.id === selectedClipId
  ) as MusicClip | undefined;

  // Find the corresponding music asset
  const musicAsset = selectedClip?.musicAssetId
    ? content.music?.find((music) => music.id === selectedClip.musicAssetId)
    : undefined;

  // Local state for pending changes
  const [localPrompt, setLocalPrompt] = useState<string>("");
  const [localModel, setLocalModel] = useState<string>("");

  // Reset local state when clip changes
  useEffect(() => {
    if (selectedClip && musicAsset) {
      setLocalPrompt(musicAsset.prompt || "");
      setLocalModel(musicAsset.type || content.config?.music?.model || "Stable Audio");
    }
  }, [selectedClipId, selectedClip, musicAsset, content.config?.music]);

  // Auto-seek to segment start when play button pressed
  useEffect(() => {
    if (isPlaying && selectedClip) {
      // If playing and we're not within the segment, jump to start
      const segmentEnd = selectedClip.startTime + selectedClip.duration;
      if (currentTime < selectedClip.startTime || currentTime >= segmentEnd) {
        onSeek(selectedClip.startTime);
      }
    }
  }, [isPlaying, selectedClip, currentTime, onSeek]);

  // Handle segment end (for looping)
  const handleSegmentEnd = () => {
    if (selectedClip) {
      console.log("🔄 Looping music segment from:", selectedClip.startTime);
      onSeek(selectedClip.startTime);
    }
  };

  const handleGenerateMusic = () => {
    if (!musicAsset || !localPrompt.trim()) {
      return;
    }

    startTransition(async () => {
      try {
        // TODO: Wire up regeneration action
        console.log("Generate music:", {
          lectureId,
          musicAssetId: musicAsset.id,
          prompt: localPrompt,
          model: localModel,
        });
      } catch (error) {
        console.error("Failed to generate music:", error);
      }
    });
  };

  if (!selectedClipId || !selectedClip) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Background Score Editor</h3>
          <p className="text-muted-foreground">Select a music clip from the timeline below</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Hidden Segment Audio Player - controlled by timeline */}
      {selectedClip && musicAsset?.audioUrl && (
        <SegmentAudioPlayer
          audioUrl={`/api/storage/${musicAsset.audioUrl}?v=${updatedAt.getTime()}`}
          segmentStartTime={selectedClip.startTime}
          segmentDuration={selectedClip.duration}
          isPlaying={isPlaying}
          currentTime={currentTime}
          onTimeUpdate={onSeek}
          onSegmentEnd={handleSegmentEnd}
        />
      )}

      {/* Scrollable content area */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
        {/* Prompt Section */}
        <div className="space-y-3">
          <Label htmlFor="musicPrompt" className="text-base font-semibold">
            Music Prompt
          </Label>
          <textarea
            id="musicPrompt"
            className="w-full h-64 p-3 border border-border rounded-md resize-none text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={localPrompt}
            onChange={(e) => setLocalPrompt(e.target.value)}
            placeholder="Describe the background music..."
            disabled={!musicAsset}
          />
        </div>

        {/* Model Configuration Section - Visually grouped */}
        <div className="space-y-4 p-5 bg-muted/30 rounded-lg">
          <h3 className="text-base font-semibold">Music Configuration</h3>
          <div className="space-y-2">
            <Label htmlFor="musicModel">Model</Label>
            <Select
              value={localModel}
              onValueChange={setLocalModel}
              disabled={!musicAsset}
            >
              <SelectTrigger id="musicModel">
                <SelectValue placeholder="Select a model..." />
              </SelectTrigger>
              <SelectContent>
                {musicModelValues.map((model) => (
                  <SelectItem key={model} value={model}>
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Generate Button - Fixed at bottom */}
      <div className="flex-shrink-0 p-4 bg-background">
        <div className="flex justify-end">
          <Button
            size="lg"
            className="min-w-48"
            disabled={!musicAsset || !localPrompt.trim() || isGenerating}
            onClick={handleGenerateMusic}
          >
            {isGenerating ? "Generating..." : "Generate Music"}
          </Button>
        </div>
      </div>
    </div>
  );
}
