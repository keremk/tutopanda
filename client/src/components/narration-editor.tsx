"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { NarrationSettings, VoiceClip } from "@/types/types";
import { DEFAULT_NARRATION_MODEL } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import NarrationModelConfig from "./narration-model-config";
import SegmentAudioPlayer from "./segment-audio-player";
import { regenerateNarrationAction } from "@/app/actions/regenerate-narration";
import AudioPreviewModal from "@/components/audio-preview-modal";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { fetchLectureProgressSubscriptionToken } from "@/app/actions/get-subscribe-token";
import type { LectureProgressMessage } from "@/inngest/functions/workflow-utils";
import { acceptNarrationAction } from "@/app/actions/accept-narration";
import { rejectNarrationAction } from "@/app/actions/reject-narration";

interface NarrationEditorProps {
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

type PendingNarrationPreview = {
  runId: string;
  narrationAssetId: string;
  narrationAsset: NarrationSettings;
};

export default function NarrationEditor({
  selectedClipId,
  currentTime,
  isPlaying,
  onSeek
}: NarrationEditorProps) {
  const { timeline, content, lectureId, updatedAt, projectSettings } = useLectureEditor();
  const [, startTransition] = useTransition();

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

  const [generationRunId, setGenerationRunId] = useState<string | null>(null);
  const [pendingNarrationPreview, setPendingNarrationPreview] = useState<PendingNarrationPreview | null>(null);
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
      setPendingNarrationPreview(null);
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
      setLocalScript(narrationAsset?.finalScript || "");
      setLocalModel(narrationAsset?.model || projectSettings.narration.model || DEFAULT_NARRATION_MODEL);
      setLocalVoice(narrationAsset?.voice || projectSettings.narration.voice || "");
      setLocalEmotion(projectSettings.narration.emotion || "");
    }
  }, [
    selectedClipId,
    selectedClip,
    narrationAsset,
    projectSettings.narration.model,
    projectSettings.narration.voice,
    projectSettings.narration.emotion,
  ]);

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

      if (payload.type === "narration-preview") {
        setPendingNarrationPreview({
          runId: payload.runId,
          narrationAssetId: payload.narrationAssetId,
          narrationAsset: payload.narrationAsset,
        });
        setIsGenerating(false);
        setGenerationError(null);
        break;
      }

      if (payload.type === "narration-complete") {
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

  const handleGenerateNarration = useCallback(() => {
    if (!narrationAsset || !localScript.trim() || isGenerating) {
      return;
    }

    setGenerationError(null);
    setPendingNarrationPreview(null);
    setIsReviewModalOpen(false);
    setIsGenerating(true);
    setGenerationRunId(null);

    startTransition(async () => {
      try {
        const { runId } = await regenerateNarrationAction({
          lectureId,
          narrationAssetId: narrationAsset.id,
          script: localScript,
          model: localModel,
          voice: localVoice,
          emotion: localEmotion,
        });
        setGenerationRunId(runId);
      } catch (error) {
        console.error("Failed to generate narration:", error);
        setGenerationError("Failed to start narration generation. Please try again.");
        setIsGenerating(false);
      }
    });
  }, [narrationAsset, localScript, localModel, localVoice, localEmotion, lectureId, isGenerating, startTransition]);

  const handleOpenReview = useCallback(() => {
    if (!pendingNarrationPreview) {
      return;
    }
    setIsReviewModalOpen(true);
  }, [pendingNarrationPreview]);

  const handlePreviewAccept = useCallback(async () => {
    if (!pendingNarrationPreview) {
      return;
    }

    setGenerationError(null);
    setIsDecisionPending(true);

    try {
      await acceptNarrationAction({
        runId: pendingNarrationPreview.runId,
        narrationAssetId: pendingNarrationPreview.narrationAssetId,
      });
      resetGeneration();
    } catch (error) {
      console.error("Failed to accept narration:", error);
      setGenerationError("Failed to accept narration. Please try again.");
    } finally {
      setIsDecisionPending(false);
    }
  }, [pendingNarrationPreview, resetGeneration]);

  const handlePreviewReject = useCallback(async () => {
    if (!pendingNarrationPreview) {
      return;
    }

    setGenerationError(null);
    setIsDecisionPending(true);

    try {
      await rejectNarrationAction({
        runId: pendingNarrationPreview.runId,
        narrationAssetId: pendingNarrationPreview.narrationAssetId,
      });
      resetGeneration();
    } catch (error) {
      console.error("Failed to reject narration:", error);
      setGenerationError("Failed to reject narration. Please try again.");
    } finally {
      setIsDecisionPending(false);
    }
  }, [pendingNarrationPreview, resetGeneration]);

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

  const hasReviewPending = Boolean(pendingNarrationPreview);
  const buttonLabel = isGenerating
    ? "Generating..."
    : hasReviewPending
      ? "Review Narration"
      : "Generate Narration";
  const buttonDisabled = isGenerating
    ? true
    : isDecisionPending
      ? true
      : hasReviewPending
        ? false
        : !narrationAsset || !localScript.trim();
  const helperText = generationError
    ? generationError
    : isDecisionPending
      ? "Finalizing your choice..."
      : isGenerating
        ? "Generating narration with AI..."
        : hasReviewPending
          ? "Review the new narration before accepting it."
          : "Generate a new narration clip to replace the current one";
  const helperTextClassName = generationError ? "text-xs text-destructive mt-2" : "text-xs text-muted-foreground mt-2";

  return (
    <>
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
          <div className="flex flex-col items-end gap-2">
            <Button
              size="lg"
              className="min-w-48"
              disabled={buttonDisabled}
              onClick={hasReviewPending ? handleOpenReview : handleGenerateNarration}
            >
              {buttonLabel}
            </Button>
            <p className={helperTextClassName}>{helperText}</p>
          </div>
        </div>
      </div>

      <AudioPreviewModal
        isOpen={isReviewModalOpen && !!pendingNarrationPreview}
        audioAsset={pendingNarrationPreview?.narrationAsset ?? null}
        title="Preview Generated Narration"
        description="Review the generated narration before accepting it. This will replace the existing narration."
        acceptLabel="Accept & Replace Narration"
        onAccept={handlePreviewAccept}
        onReject={handlePreviewReject}
        isDecisionPending={isDecisionPending}
      />
    </>
  );
}
