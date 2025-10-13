"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { MusicClip, MusicSettings } from "@/types/types";
import { musicModelValues, migrateMusicModel, DEFAULT_MUSIC_MODEL } from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import SegmentAudioPlayer from "./segment-audio-player";
import { regenerateMusicAction } from "@/app/actions/regenerate-music";
import AudioPreviewModal from "@/components/audio-preview-modal";
import { acceptMusicAction } from "@/app/actions/accept-music";
import { rejectMusicAction } from "@/app/actions/reject-music";
import { useAssetGenerationFlow } from "@/hooks/use-asset-generation-flow";
import { useAssetDraft } from "@/hooks/use-asset-draft";
import { buildAssetUrl } from "@/lib/asset-url";
import type { LectureMusicPreviewMessage } from "@/inngest/functions/workflow-utils";

interface BackgroundScoreEditorProps {
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

type MusicDraftState = {
  prompt: string;
  model: string;
};

const toStorageUrl = (url?: string | null) => (url ? `/api/storage/${url}` : "");

export default function BackgroundScoreEditor({
  selectedClipId,
  currentTime,
  isPlaying,
  onSeek,
}: BackgroundScoreEditorProps) {
  const {
    timeline,
    content,
    lectureId,
    updatedAt,
    projectSettings,
  } = useLectureEditor();

  const selectedClip = useMemo(
    () =>
      (timeline?.tracks.music.find((clip) => clip.id === selectedClipId) ?? null) as
        | MusicClip
        | null,
    [timeline, selectedClipId]
  );

  const musicAsset = useMemo(
    () =>
      selectedClip?.musicAssetId
        ? content.music?.find((asset) => asset.id === selectedClip.musicAssetId)
        : undefined,
    [content.music, selectedClip]
  );

  const baseMusicDraft = useMemo<MusicDraftState>(
    () => {
      if (!musicAsset) {
        return {
          prompt: "",
          model: projectSettings.music.model || DEFAULT_MUSIC_MODEL,
        };
      }

      const rawModel = musicAsset.type || projectSettings.music.model || DEFAULT_MUSIC_MODEL;
      return {
        prompt: musicAsset.prompt || "",
        model: migrateMusicModel(rawModel),
      };
    },
    [musicAsset?.prompt, musicAsset?.type, projectSettings.music.model]
  );

  const {
    draft,
    setDraft,
    applyPreview: applyMusicDraftPreview,
  } = useAssetDraft<MusicDraftState>({
    assetId: musicAsset?.id ?? null,
    baseDraft: baseMusicDraft,
  });

  useEffect(() => {
    if (!selectedClip || !isPlaying) {
      return;
    }

    const segmentEnd = selectedClip.startTime + selectedClip.duration;
    if (currentTime < selectedClip.startTime || currentTime >= segmentEnd) {
      onSeek(selectedClip.startTime);
    }
  }, [isPlaying, selectedClip, currentTime, onSeek]);

  const handleSegmentEnd = useCallback(() => {
    if (selectedClip) {
      onSeek(selectedClip.startTime);
    }
  }, [selectedClip, onSeek]);

  const {
    isGenerating,
    isReviewOpen,
    isDecisionPending,
    error: generationError,
    preview,
    previewVersion,
    startGeneration,
    openReview,
    closeReview,
    acceptPreview,
    rejectPreview,
  } = useAssetGenerationFlow<LectureMusicPreviewMessage>({
    assetType: "music",
    lectureId,
    assetId: musicAsset?.id ?? null,
    onRegenerate: async () =>
      regenerateMusicAction({
        lectureId,
        musicAssetId: musicAsset!.id,
        prompt: draft.prompt,
        durationSeconds: selectedClip!.duration,
        model: draft.model || undefined,
      }),
    onAccept: (runId, assetId) =>
      acceptMusicAction({
        runId,
        musicAssetId: assetId,
      }).then(() => undefined),
    onReject: (runId, assetId) =>
      rejectMusicAction({
        runId,
        musicAssetId: assetId,
      }).then(() => undefined),
    previewMessageType: "music-preview",
    completeMessageType: "music-complete",
    extractPreview: (message) =>
      message.type === "music-preview"
        ? { preview: message, assetId: message.musicAssetId }
        : null,
    mapPreviewToAssetUpdate: (message) => message.musicAsset,
    onPreviewAccepted: (message) => {
      applyMusicDraftPreview({
        prompt: message.musicAsset.prompt || draft.prompt,
        model: migrateMusicModel(message.musicAsset.type || draft.model),
      });
    },
  });

  const committedAudioUrl = useMemo(() => {
    if (!musicAsset?.audioUrl) {
      return "";
    }
    return buildAssetUrl({ url: toStorageUrl(musicAsset.audioUrl), updatedAt });
  }, [musicAsset, updatedAt]);

  const previewAudioUrl = useMemo(() => {
    if (!preview) {
      return "";
    }
    return buildAssetUrl({
      url: toStorageUrl(preview.musicAsset.audioUrl),
      previewToken: previewVersion,
    });
  }, [preview, previewVersion]);

  const buttonLabel = useMemo(() => {
    if (isGenerating) {
      return "Generating...";
    }
    if (preview) {
      return "Review Music";
    }
    return "Generate Music";
  }, [isGenerating, preview]);

  const buttonDisabled = useMemo(() => {
    if (isGenerating || isDecisionPending) {
      return true;
    }
    if (preview) {
      return false;
    }
    return !musicAsset || draft.prompt.trim().length === 0;
  }, [isGenerating, isDecisionPending, preview, musicAsset, draft.prompt]);

  const helperText = useMemo(() => {
    if (generationError) {
      return generationError;
    }
    if (isDecisionPending) {
      return "Finalizing your choice...";
    }
    if (isGenerating) {
      return "Generating music with AI...";
    }
    if (preview) {
      return "Review the generated track before accepting it.";
    }
    return "Generate background music to replace the current track.";
  }, [generationError, isDecisionPending, isGenerating, preview]);

  const helperTextClassName = useMemo(
    () =>
      generationError
        ? "text-xs text-destructive mt-2"
        : "text-xs text-muted-foreground mt-2",
    [generationError]
  );

  const handlePrimaryAction = useCallback(() => {
    if (preview) {
      openReview();
    } else {
      void startGeneration();
    }
  }, [preview, openReview, startGeneration]);

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
    <>
      <div className="h-full flex flex-col bg-background">
        {selectedClip && musicAsset?.audioUrl && (
          <SegmentAudioPlayer
            audioUrl={committedAudioUrl}
            segmentStartTime={selectedClip.startTime}
            segmentDuration={selectedClip.duration}
            isPlaying={isPlaying}
            currentTime={currentTime}
            onTimeUpdate={onSeek}
            onSegmentEnd={handleSegmentEnd}
          />
        )}

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          <div className="space-y-3">
            <Label htmlFor="musicPrompt" className="text-base font-semibold">
              Music Prompt
            </Label>
            <textarea
              id="musicPrompt"
              className="w-full h-64 p-3 border border-border rounded-md resize-none text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={draft.prompt}
              onChange={(e) => setDraft((prev) => ({ ...prev, prompt: e.target.value }))}
              placeholder="Describe the background music..."
              disabled={!musicAsset}
            />
          </div>

          <div className="space-y-4 p-5 bg-muted/30 rounded-lg">
            <h3 className="text-base font-semibold">Music Configuration</h3>
            <div className="space-y-2">
              <Label htmlFor="musicModel">Model</Label>
              <select
                id="musicModel"
                className="w-full p-2 border border-border rounded-md bg-background"
                value={draft.model}
                onChange={(e) => setDraft((prev) => ({ ...prev, model: e.target.value }))}
                disabled={!musicAsset}
              >
                <option value="" disabled>
                  Select a model...
                </option>
                {musicModelValues.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                {musicAsset?.type
                  ? "Override model"
                  : projectSettings.music.model
                  ? `Using project: ${projectSettings.music.model}`
                  : "No model configured"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex-shrink-0 p-4 bg-background">
          <div className="flex flex-col items-end gap-2">
            <Button
              size="lg"
              className="min-w-48"
              disabled={buttonDisabled}
              onClick={handlePrimaryAction}
            >
              {buttonLabel}
            </Button>
            <p className={helperTextClassName}>{helperText}</p>
          </div>
        </div>
      </div>

      <AudioPreviewModal
        isOpen={isReviewOpen && !!preview}
        audioAsset={preview?.musicAsset ?? null}
        audioUrl={previewAudioUrl}
        title="Preview Generated Music"
        description="Review the generated background music before accepting it. This will replace the existing music."
        acceptLabel="Accept & Replace Music"
        onAccept={acceptPreview}
        onReject={rejectPreview}
        onClose={closeReview}
        isDecisionPending={isDecisionPending}
      />
    </>
  );
}
