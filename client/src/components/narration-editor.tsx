"use client";

import { useState, useEffect, useTransition } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { VoiceClip } from "@/types/types";
import { DEFAULT_NARRATION_MODEL } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import NarrationModelConfig from "./narration-model-config";
import SegmentAudioPlayer from "./segment-audio-player";
import { regenerateNarrationAction } from "@/app/actions/regenerate-narration";

interface NarrationEditorProps {
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

export default function NarrationEditor({
  selectedClipId,
  currentTime,
  isPlaying,
  onSeek
}: NarrationEditorProps) {
  const { timeline, content, lectureId, updatedAt } = useLectureEditor();
  const [isGenerating, startTransition] = useTransition();

  // Find the selected clip
  const selectedClip = timeline?.tracks.voice.find(
    (clip) => clip.id === selectedClipId
  ) as VoiceClip | undefined;

  // Find the corresponding narration asset
  const narrationAsset = selectedClip?.narrationAssetId
    ? content.narration?.find((narr) => narr.id === selectedClip.narrationAssetId)
    : undefined;

  // Local state for pending changes
  const [localScript, setLocalScript] = useState<string>("");
  const [localModel, setLocalModel] = useState<string>("");
  const [localVoice, setLocalVoice] = useState<string>("");
  const [localEmotion, setLocalEmotion] = useState<string>("");

  // Reset local state when clip changes
  useEffect(() => {
    if (selectedClip) {
      setLocalScript(narrationAsset?.finalScript || "");
      setLocalModel(narrationAsset?.model || content.config?.narration?.model || DEFAULT_NARRATION_MODEL);
      setLocalVoice(narrationAsset?.voice || content.config?.narration?.voice || "");
      setLocalEmotion(content.config?.narration?.emotion || "");
    }
  }, [selectedClipId, selectedClip, narrationAsset, content.config?.narration?.model, content.config?.narration?.voice, content.config?.narration?.emotion]);

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
      console.log("🔄 Looping narration segment from:", selectedClip.startTime);
      onSeek(selectedClip.startTime);
    }
  };

  const handleGenerateNarration = () => {
    if (!narrationAsset || !localScript.trim()) {
      return;
    }

    startTransition(async () => {
      try {
        await regenerateNarrationAction({
          lectureId,
          narrationAssetId: narrationAsset.id,
          script: localScript,
          model: localModel,
          voice: localVoice,
          emotion: localEmotion,
        });
      } catch (error) {
        console.error("Failed to generate narration:", error);
      }
    });
  };

  if (!selectedClipId || !selectedClip) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg border border-border">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Narration Editor</h3>
          <p className="text-muted-foreground">Select a voice clip from the timeline below</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Hidden Segment Audio Player - controlled by timeline */}
      {selectedClip && narrationAsset?.sourceUrl && (
        <SegmentAudioPlayer
          audioUrl={`/api/storage/${narrationAsset.sourceUrl}?v=${updatedAt.getTime()}`}
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
        {/* Script Section */}
        <div className="space-y-3">
          <Label htmlFor="narrationScript" className="text-base font-semibold">
            Narration Script
          </Label>
          <textarea
            id="narrationScript"
            className="w-full h-64 p-3 border border-border rounded-md resize-none font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            value={localScript}
            onChange={(e) => setLocalScript(e.target.value)}
            placeholder="Enter the narration script..."
            disabled={!narrationAsset}
          />
        </div>

        {/* Model Configuration Section - Visually grouped */}
        <div className="space-y-4 p-5 bg-muted/30 rounded-lg">
          <h3 className="text-base font-semibold">Voice Configuration</h3>
          <NarrationModelConfig
            model={localModel}
            voice={localVoice}
            emotion={localEmotion}
            onModelChange={setLocalModel}
            onVoiceChange={setLocalVoice}
            onEmotionChange={setLocalEmotion}
          />
        </div>
      </div>

      {/* Generate Button - Fixed at bottom */}
      <div className="flex-shrink-0 p-4 bg-background">
        <div className="flex justify-end">
          <Button
            size="lg"
            className="min-w-48"
            disabled={!narrationAsset || !localScript.trim() || isGenerating}
            onClick={handleGenerateNarration}
          >
            {isGenerating ? "Generating..." : "Generate Narration"}
          </Button>
        </div>
      </div>
    </div>
  );
}
