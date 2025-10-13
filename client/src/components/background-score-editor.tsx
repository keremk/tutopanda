"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { MusicClip, MusicSettings } from "@/types/types";
import { musicModelValues, migrateMusicModel, DEFAULT_MUSIC_MODEL } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import SegmentAudioPlayer from "./segment-audio-player";
import { regenerateMusicAction } from "@/app/actions/regenerate-music";
import AudioPreviewModal from "@/components/audio-preview-modal";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { fetchLectureProgressSubscriptionToken } from "@/app/actions/get-subscribe-token";
import type { LectureProgressMessage } from "@/inngest/functions/workflow-utils";
import { acceptMusicAction } from "@/app/actions/accept-music";
import { rejectMusicAction } from "@/app/actions/reject-music";

interface BackgroundScoreEditorProps {
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

type PendingMusicPreview = {
  runId: string;
  musicAssetId: string;
  musicAsset: MusicSettings;
};

export default function BackgroundScoreEditor({
  selectedClipId,
  currentTime,
  isPlaying,
  onSeek
}: BackgroundScoreEditorProps) {
  const { timeline, content, lectureId, updatedAt, projectSettings } = useLectureEditor();
  const [, startTransition] = useTransition();

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

  const [generationRunId, setGenerationRunId] = useState<string | null>(null);
  const [pendingMusicPreview, setPendingMusicPreview] = useState<PendingMusicPreview | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [isDecisionPending, setIsDecisionPending] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);

  const { data: subscriptionData = [] } = useInngestSubscription({
    refreshToken: fetchLectureProgressSubscriptionToken,
  });

  const resetGeneration = useCallback(
    (options?: { keepError?: boolean }) => {
      setGenerationRunId(null);
      setPendingMusicPreview(null);
      setIsGenerating(false);
      setIsReviewModalOpen(false);
      setIsDecisionPending(false);
      if (!options?.keepError) {
        setGenerationError(null);
      }
    },
    []
  );

  // Reset local state when clip changes
  useEffect(() => {
    if (selectedClip) {
      setLocalPrompt(musicAsset?.prompt || "");

      const rawModel = musicAsset?.type || projectSettings.music.model || DEFAULT_MUSIC_MODEL;
      setLocalModel(migrateMusicModel(rawModel));
    }
  }, [selectedClipId, selectedClip, musicAsset, projectSettings.music.model]);

  useEffect(() => {
    resetGeneration();
  }, [selectedClipId, resetGeneration]);

  // Auto-seek to segment start when play button pressed
  useEffect(() => {
    if (isPlaying && selectedClip) {
      const segmentEnd = selectedClip.startTime + selectedClip.duration;
      if (currentTime < selectedClip.startTime || currentTime >= segmentEnd) {
        onSeek(selectedClip.startTime);
      }
    }
  }, [isPlaying, selectedClip, currentTime, onSeek]);

  // Handle segment end (for looping)
  const handleSegmentEnd = () => {
    if (selectedClip) {
      onSeek(selectedClip.startTime);
    }
  };

  useEffect(() => {
    if (!generationRunId) {
      return;
    }

    for (const message of subscriptionData) {
      if (message.topic !== "progress") {
        continue;
      }

      const payload = message.data as LectureProgressMessage | undefined;
      if (!payload || payload.runId !== generationRunId) {
        continue;
      }

      if (payload.type === "music-preview") {
        setPendingMusicPreview({
          runId: payload.runId,
          musicAssetId: payload.musicAssetId,
          musicAsset: payload.musicAsset,
        });
        setIsGenerating(false);
        setGenerationError(null);
        break;
      }

      if (payload.type === "music-complete") {
        resetGeneration();
        break;
      }

      if (payload.type === "status" && payload.status === "error") {
        setGenerationError(payload.message);
        resetGeneration({ keepError: true });
        break;
      }
    }
  }, [generationRunId, subscriptionData, resetGeneration]);

  const handleGenerateMusic = useCallback(() => {
    if (!musicAsset || !localPrompt.trim() || !selectedClip || isGenerating) {
      return;
    }

    setGenerationError(null);
    setPendingMusicPreview(null);
    setIsReviewModalOpen(false);
    setIsGenerating(true);
    setGenerationRunId(null);

    startTransition(async () => {
      try {
        const { runId } = await regenerateMusicAction({
          lectureId,
          musicAssetId: musicAsset.id,
          prompt: localPrompt,
          durationSeconds: selectedClip.duration,
          model: localModel || undefined,
        });
        setGenerationRunId(runId);
      } catch (error) {
        console.error("Failed to generate music:", error);
        setGenerationError("Failed to start music generation. Please try again.");
        setIsGenerating(false);
      }
    });
  }, [musicAsset, localPrompt, selectedClip, localModel, lectureId, isGenerating, startTransition]);

  const handleOpenReview = useCallback(() => {
    if (!pendingMusicPreview) {
      return;
    }
    setIsReviewModalOpen(true);
  }, [pendingMusicPreview]);

  const handlePreviewAccept = useCallback(async () => {
    if (!pendingMusicPreview) {
      return;
    }

    setGenerationError(null);
    setIsDecisionPending(true);

    try {
      await acceptMusicAction({
        runId: pendingMusicPreview.runId,
        musicAssetId: pendingMusicPreview.musicAssetId,
      });
      resetGeneration();
    } catch (error) {
      console.error("Failed to accept music:", error);
      setGenerationError("Failed to accept music. Please try again.");
    } finally {
      setIsDecisionPending(false);
    }
  }, [pendingMusicPreview, resetGeneration]);

  const handlePreviewReject = useCallback(async () => {
    if (!pendingMusicPreview) {
      return;
    }

    setGenerationError(null);
    setIsDecisionPending(true);

    try {
      await rejectMusicAction({
        runId: pendingMusicPreview.runId,
        musicAssetId: pendingMusicPreview.musicAssetId,
      });
      resetGeneration();
    } catch (error) {
      console.error("Failed to reject music:", error);
      setGenerationError("Failed to reject music. Please try again.");
    } finally {
      setIsDecisionPending(false);
    }
  }, [pendingMusicPreview, resetGeneration]);

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

  const hasReviewPending = Boolean(pendingMusicPreview);
  const buttonLabel = isGenerating
    ? "Generating..."
    : hasReviewPending
      ? "Review Music"
      : "Generate Music";
  const buttonDisabled = isGenerating
    ? true
    : isDecisionPending
      ? true
      : hasReviewPending
        ? false
        : !musicAsset || !localPrompt.trim();
  const helperText = generationError
    ? generationError
    : isDecisionPending
      ? "Finalizing your choice..."
      : isGenerating
        ? "Generating music with AI..."
        : hasReviewPending
          ? "Review the new track before accepting it."
          : "Generate background music to replace the current track";
  const helperTextClassName = generationError ? "text-xs text-destructive mt-2" : "text-xs text-muted-foreground mt-2";

  return (
    <>
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
              <select
                id="musicModel"
                className="w-full p-2 border border-border rounded-md bg-background"
                value={localModel}
                onChange={(e) => setLocalModel(e.target.value)}
                disabled={!musicAsset}
              >
                <option value="" disabled>Select a model...</option>
                {musicModelValues.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {musicAsset?.type ? "Override model" : projectSettings.music.model ? `Using project: ${projectSettings.music.model}` : "No model configured"}
              </p>
            </div>
          </div>
        </div>

        {/* Generate Button - Fixed at bottom */}
        <div className="flex-shrink-0 p-4 bg-background">
          <div className="flex flex-col items-end gap-2">
            <Button
              size="lg"
              className="min-w-48"
              disabled={buttonDisabled}
              onClick={hasReviewPending ? handleOpenReview : handleGenerateMusic}
            >
              {buttonLabel}
            </Button>
            <p className={helperTextClassName}>{helperText}</p>
          </div>
        </div>
      </div>

      <AudioPreviewModal
        isOpen={isReviewModalOpen && !!pendingMusicPreview}
        audioAsset={pendingMusicPreview?.musicAsset ?? null}
        title="Preview Generated Music"
        description="Review the generated background music before accepting it. This will replace the existing music."
        acceptLabel="Accept & Replace Music"
        onAccept={handlePreviewAccept}
        onReject={handlePreviewReject}
        isDecisionPending={isDecisionPending}
      />
    </>
  );
}
