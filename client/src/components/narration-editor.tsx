"use client";

import { useCallback, useEffect, useMemo } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { VoiceClip, NarrationSettings } from "@/types/types";
import {
  DEFAULT_NARRATION_MODEL,
  getDefaultVoiceForNarrationModel,
  getNarrationModelDefinition,
} from "@/lib/models";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import NarrationModelConfig from "./narration-model-config";
import SegmentAudioPlayer from "./segment-audio-player";
import { regenerateNarrationAction } from "@/app/actions/regenerate-narration";
import AudioPreviewModal from "@/components/audio-preview-modal";
import { acceptNarrationAction } from "@/app/actions/accept-narration";
import { rejectNarrationAction } from "@/app/actions/reject-narration";
import { useAssetGenerationFlow } from "@/hooks/use-asset-generation-flow";
import { useAssetDraft } from "@/hooks/use-asset-draft";
import { buildAssetUrl } from "@/lib/asset-url";
import type { LectureNarrationPreviewMessage } from "@/inngest/functions/workflow-utils";

interface NarrationEditorProps {
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  onSeek: (time: number) => void;
}

type NarrationDraftState = {
  script: string;
  model: string;
  voice: string;
  emotion: string;
};

const toStorageUrl = (url?: string | null) => (url ? `/api/storage/${url}` : "");

export default function NarrationEditor({
  selectedClipId,
  currentTime,
  isPlaying,
  onSeek,
}: NarrationEditorProps) {
  const {
    timeline,
    content,
    lectureId,
    updatedAt,
    projectSettings,
  } = useLectureEditor();

  const selectedClip = useMemo(
    () =>
      (timeline?.tracks.voice.find((clip) => clip.id === selectedClipId) ?? null) as
        | VoiceClip
        | null,
    [timeline, selectedClipId]
  );

  const narrationAsset = useMemo(
    () =>
      selectedClip?.narrationAssetId
        ? content.narration?.find((asset) => asset.id === selectedClip.narrationAssetId)
        : undefined,
    [content.narration, selectedClip]
  );

  const defaultNarrationModel = projectSettings.narration.model || DEFAULT_NARRATION_MODEL;
  const defaultModelDefinition = getNarrationModelDefinition(defaultNarrationModel);
  const defaultVoice =
    projectSettings.narration.voice ||
    getDefaultVoiceForNarrationModel(defaultNarrationModel) ||
    "";
  const defaultEmotion =
    defaultModelDefinition?.supportsEmotion ? projectSettings.narration.emotion || "" : "";

  const baseNarrationDraft = useMemo<NarrationDraftState>(
    () => {
      const model = narrationAsset?.model || defaultNarrationModel;
      const modelDefinition = getNarrationModelDefinition(model);
      const resolvedVoice =
        narrationAsset?.voice ||
        projectSettings.narration.voice ||
        getDefaultVoiceForNarrationModel(model) ||
        defaultVoice;

      const resolvedEmotion =
        modelDefinition?.supportsEmotion ? narrationAsset?.emotion || defaultEmotion : "";

      return {
        script: narrationAsset?.finalScript || "",
        model,
        voice: resolvedVoice,
        emotion: resolvedEmotion,
      };
    },
    [
      narrationAsset?.finalScript,
      narrationAsset?.model,
      narrationAsset?.voice,
      narrationAsset?.emotion,
      defaultNarrationModel,
      defaultVoice,
      defaultEmotion,
      projectSettings.narration.voice,
    ]
  );

  const {
    draft,
    setDraft,
    applyPreview: applyNarrationDraftPreview,
  } = useAssetDraft<NarrationDraftState>({
    assetId: narrationAsset?.id ?? null,
    baseDraft: baseNarrationDraft,
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
  } = useAssetGenerationFlow<LectureNarrationPreviewMessage>({
    assetType: "narration",
    lectureId,
    assetId: narrationAsset?.id ?? null,
    onRegenerate: async () =>
      regenerateNarrationAction({
        lectureId,
        narrationAssetId: narrationAsset!.id,
        script: draft.script,
        model: draft.model,
        voice: draft.voice,
        emotion: draft.emotion || undefined,
      }),
    onAccept: (runId, assetId) =>
      acceptNarrationAction({
        runId,
        narrationAssetId: assetId,
      }).then(() => undefined),
    onReject: (runId, assetId) =>
      rejectNarrationAction({
        runId,
        narrationAssetId: assetId,
      }).then(() => undefined),
    previewMessageType: "narration-preview",
    completeMessageType: "narration-complete",
    extractPreview: (message) =>
      message.type === "narration-preview"
        ? { preview: message, assetId: message.narrationAssetId }
        : null,
    mapPreviewToAssetUpdate: (message) => message.narrationAsset,
    onPreviewAccepted: (message) => {
      applyNarrationDraftPreview({
        script: message.narrationAsset.finalScript || draft.script,
        model: message.narrationAsset.model || draft.model,
        voice: message.narrationAsset.voice || draft.voice,
        emotion: draft.emotion,
      });
    },
  });

  const committedAudioUrl = useMemo(() => {
    const baseUrl = narrationAsset?.sourceUrl
      ? toStorageUrl(narrationAsset.sourceUrl)
      : null;
    return buildAssetUrl({ url: baseUrl, updatedAt });
  }, [narrationAsset, updatedAt]);

  const previewAudioUrl = useMemo(() => {
    if (!preview) {
      return "";
    }
    return buildAssetUrl({
      url: toStorageUrl(preview.narrationAsset.sourceUrl),
      previewToken: previewVersion,
    });
  }, [preview, previewVersion]);

  const buttonLabel = useMemo(() => {
    if (isGenerating) {
      return "Generating...";
    }
    if (preview) {
      return "Review Narration";
    }
    return "Generate Narration";
  }, [isGenerating, preview]);

  const buttonDisabled = useMemo(() => {
    if (isGenerating || isDecisionPending) {
      return true;
    }
    if (preview) {
      return false;
    }
    return !narrationAsset || draft.script.trim().length === 0;
  }, [isGenerating, isDecisionPending, preview, narrationAsset, draft.script]);

  const helperText = useMemo(() => {
    if (generationError) {
      return generationError;
    }
    if (isDecisionPending) {
      return "Finalizing your choice...";
    }
    if (isGenerating) {
      return "Generating narration with AI...";
    }
    if (preview) {
      return "Review the generated narration before accepting it.";
    }
    return "Generate a new narration clip to replace the current one.";
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
      <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg border border-border">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Narration Editor</h3>
          <p className="text-muted-foreground">Select a voice clip from the timeline below</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col bg-background">
        {selectedClip && narrationAsset?.sourceUrl && (
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
            <Label htmlFor="narrationScript" className="text-base font-semibold">
              Narration Script
            </Label>
            <textarea
              id="narrationScript"
              className="w-full h-64 p-3 border border-border rounded-md resize-none font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              value={draft.script}
              onChange={(e) => setDraft((prev) => ({ ...prev, script: e.target.value }))}
              placeholder="Enter the narration script..."
              disabled={!narrationAsset}
            />
          </div>

          <div className="space-y-4 p-5 bg-muted/30 rounded-lg">
            <h3 className="text-base font-semibold">Voice Configuration</h3>
            <NarrationModelConfig
              model={draft.model}
              voice={draft.voice}
              emotion={draft.emotion}
              language={projectSettings.general.language}
              onModelChange={(value) => setDraft((prev) => ({ ...prev, model: value }))}
              onVoiceChange={(value) => setDraft((prev) => ({ ...prev, voice: value }))}
              onEmotionChange={(value) => setDraft((prev) => ({ ...prev, emotion: value }))}
            />
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
        audioAsset={preview?.narrationAsset ?? null}
        audioUrl={previewAudioUrl}
        title="Preview Generated Narration"
        description="Review the generated narration before accepting it. This will replace the existing narration."
        acceptLabel="Accept & Replace Narration"
        onAccept={acceptPreview}
        onReject={rejectPreview}
        onClose={closeReview}
        isDecisionPending={isDecisionPending}
      />
    </>
  );
}
