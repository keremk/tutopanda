"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { KenBurnsClip } from "@/types/types";
import { imageModelValues } from "@/lib/models";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import LazyEffectPreview from "./lazy-effect-preview";
import { kenBurnsEffects } from "@/lib/timeline/ken-burns";
import { regenerateImageAction } from "@/app/actions/regenerate-image";
import ImagePreviewModal from "@/components/image-preview-modal";
import { acceptImageAction } from "@/app/actions/accept-image";
import { rejectImageAction } from "@/app/actions/reject-image";
import { useAssetGenerationFlow } from "@/hooks/use-asset-generation-flow";
import { useAssetDraft } from "@/hooks/use-asset-draft";
import { buildAssetUrl } from "@/lib/asset-url";
import type { LectureImagePreviewMessage } from "@/inngest/functions/workflow-utils";

interface VisualsEditorProps {
  selectedClipId: string | null;
}

type ImageDraftState = {
  prompt: string;
  model: string;
};

const toStorageUrl = (sourceUrl?: string | null) =>
  sourceUrl ? `/api/storage/${sourceUrl}` : "";

export default function VisualsEditor({ selectedClipId }: VisualsEditorProps) {
  const {
    timeline,
    content,
    updateTimeline,
    lectureId,
    updatedAt,
    projectSettings,
  } = useLectureEditor();

  const selectedClip = useMemo(
    () =>
      (timeline?.tracks.visual.find((clip) => clip.id === selectedClipId) ?? null) as
        | KenBurnsClip
        | null,
    [timeline, selectedClipId]
  );

  const imageAsset = useMemo(
    () =>
      selectedClip?.imageAssetId
        ? content.images?.find((img) => img.id === selectedClip.imageAssetId)
        : undefined,
    [content.images, selectedClip]
  );

  const [localEffectName, setLocalEffectName] = useState<string>(
    selectedClip?.effectName || ""
  );

  const defaultImageModel = projectSettings.image.model || "";

  const baseImageDraft = useMemo<ImageDraftState>(
    () => ({
      prompt: imageAsset?.prompt || "",
      model: imageAsset?.model || defaultImageModel,
    }),
    [imageAsset?.prompt, imageAsset?.model, defaultImageModel]
  );

  const {
    draft: imageDraft,
    setDraft: setImageDraft,
    applyPreview: applyImageDraftPreview,
  } = useAssetDraft<ImageDraftState>({
    assetId: imageAsset?.id ?? null,
    baseDraft: baseImageDraft,
  });

  const handlePromptChange = useCallback(
    (value: string) => {
      setImageDraft((prev) => ({ ...prev, prompt: value }));
    },
    [setImageDraft]
  );

  const handleModelChange = useCallback(
    (value: string) => {
      setImageDraft((prev) => ({ ...prev, model: value }));
    },
    [setImageDraft]
  );

  const hasEffectChanges = useMemo(() => {
    if (!selectedClip) {
      return false;
    }
    return localEffectName !== (selectedClip.effectName || "");
  }, [selectedClip, localEffectName]);

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
  } = useAssetGenerationFlow<LectureImagePreviewMessage>({
    assetType: "image",
    lectureId,
    assetId: imageAsset?.id ?? null,
    onRegenerate: async () =>
      regenerateImageAction({
        lectureId,
        imageAssetId: imageAsset!.id,
        prompt: imageDraft.prompt,
        model: imageDraft.model || undefined,
      }),
    onAccept: (runId, assetId) =>
      acceptImageAction({
        runId,
        imageAssetId: assetId,
      }).then(() => undefined),
    onReject: (runId, assetId) =>
      rejectImageAction({
        runId,
        imageAssetId: assetId,
      }).then(() => undefined),
    previewMessageType: "image-preview",
    completeMessageType: "image-complete",
    extractPreview: (message) =>
      message.type === "image-preview"
        ? { preview: message, assetId: message.imageAssetId }
        : null,
    mapPreviewToAssetUpdate: (message) => message.imageAsset,
    onPreviewAccepted: (message) => {
      applyImageDraftPreview({
        prompt: message.imageAsset.prompt || "",
        model: message.imageAsset.model || defaultImageModel,
      });
    },
  });

  const committedImageUrl = useMemo(() => {
    if (preview) {
      const previewUrl = toStorageUrl(preview.imageAsset.sourceUrl);
      return buildAssetUrl({ url: previewUrl, previewToken: previewVersion });
    }

    if (selectedClip?.imageUrl) {
      return selectedClip.imageUrl;
    }

    const assetUrl = toStorageUrl(imageAsset?.sourceUrl);
    return buildAssetUrl({ url: assetUrl, updatedAt });
  }, [preview, previewVersion, selectedClip, updatedAt, imageAsset]);

  const previewImageUrl = useMemo(() => {
    if (!preview) {
      return "";
    }
    return buildAssetUrl({
      url: toStorageUrl(preview.imageAsset.sourceUrl),
      previewToken: previewVersion,
    });
  }, [preview, previewVersion]);

  const buttonLabel = useMemo(() => {
    if (isGenerating) {
      return "Generating...";
    }
    if (preview) {
      return "Review Image";
    }
    return "Generate Image";
  }, [isGenerating, preview]);

  const buttonDisabled = useMemo(() => {
    if (isGenerating || isDecisionPending) {
      return true;
    }
    if (preview) {
      return false;
    }
    return !imageAsset || imageDraft.prompt.trim().length === 0;
  }, [isGenerating, isDecisionPending, preview, imageAsset, imageDraft.prompt]);

  const helperText = useMemo(() => {
    if (generationError) {
      return generationError;
    }
    if (isDecisionPending) {
      return "Finalizing your choice...";
    }
    if (isGenerating) {
      return "Generating new image with AI...";
    }
    if (preview) {
      return "Review the generated image before accepting it.";
    }
    return "Generate a new image to replace the current one.";
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

  const handleSaveEffect = useCallback(() => {
    if (!selectedClip || !timeline) {
      return;
    }

    updateTimeline((prevTimeline) => {
      if (!prevTimeline) return null;

      const effect = kenBurnsEffects[localEffectName];
      if (!effect) return prevTimeline;

      const updatedVisualTrack = prevTimeline.tracks.visual.map((clip) => {
        if (clip.id === selectedClip.id) {
          return {
            ...clip,
            effectName: localEffectName,
            startScale: effect.startScale,
            endScale: effect.endScale,
            startX: effect.startX,
            startY: effect.startY,
            endX: effect.endX,
            endY: effect.endY,
          };
        }
        return clip;
      });

      return {
        ...prevTimeline,
        tracks: {
          ...prevTimeline.tracks,
          visual: updatedVisualTrack,
        },
      };
    });
  }, [selectedClip, timeline, updateTimeline, localEffectName]);

  const handleResetEffect = useCallback(() => {
    if (selectedClip) {
      setLocalEffectName(selectedClip.effectName || "");
    }
  }, [selectedClip]);

  useEffect(() => {
    if (selectedClip) {
      setLocalEffectName(selectedClip.effectName || "");
    }
  }, [selectedClip]);

  if (!selectedClipId || !selectedClip) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg border border-border">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Visuals Editor</h3>
          <p className="text-muted-foreground">Select a visual clip from the timeline below</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex gap-6 bg-background">
        <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border border-border overflow-hidden">
          {committedImageUrl ? (
            <LazyEffectPreview
              clip={selectedClip}
              imageUrl={committedImageUrl}
              effectName={localEffectName}
            />
          ) : (
            <div className="text-center text-muted-foreground">
              <p>No image available</p>
              <p className="text-xs mt-2">Selected clip: {selectedClip.name}</p>
            </div>
          )}
        </div>

        <div className="w-96 h-full flex-shrink-0">
          <Tabs defaultValue="image" className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="image">Image</TabsTrigger>
              <TabsTrigger value="effects">Effects</TabsTrigger>
            </TabsList>

            <TabsContent value="image" className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-4">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Image Settings</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image-prompt">Image Prompt</Label>
                  <Textarea
                    id="image-prompt"
                    className="min-h-24 resize-none"
                    value={imageDraft.prompt}
                    onChange={(e) => handlePromptChange(e.target.value)}
                    placeholder="Describe the image..."
                    disabled={!imageAsset}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ai-model">AI Model</Label>
                  <Select
                    value={imageDraft.model}
                    onValueChange={handleModelChange}
                    disabled={!imageAsset}
                  >
                    <SelectTrigger id="ai-model">
                      <SelectValue placeholder="Select a model..." />
                    </SelectTrigger>
                    <SelectContent>
                      {imageModelValues.map((model) => (
                        <SelectItem key={model} value={model}>
                          {model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {imageAsset?.model
                      ? "Override model"
                      : projectSettings.image.model
                      ? `Using project: ${projectSettings.image.model}`
                      : "No model configured"}
                  </p>
                </div>

                <div className="pt-4">
                  <Button
                    className="w-full"
                    disabled={buttonDisabled}
                    onClick={handlePrimaryAction}
                  >
                    {buttonLabel}
                  </Button>
                  <p className={helperTextClassName}>{helperText}</p>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="effects" className="flex-1 overflow-y-auto">
              <div className="space-y-6 p-4">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Effect Settings</h3>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ken-burns-effect">Ken Burns Effect</Label>
                  <Select
                    value={localEffectName}
                    onValueChange={setLocalEffectName}
                  >
                    <SelectTrigger id="ken-burns-effect">
                      <SelectValue placeholder="Select an effect..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Portrait Effects</SelectLabel>
                        <SelectItem value="portraitZoomIn">Portrait Zoom In</SelectItem>
                        <SelectItem value="portraitZoomOut">Portrait Zoom Out</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Landscape Effects</SelectLabel>
                        <SelectItem value="landscapePanLeft">Landscape Pan Left</SelectItem>
                        <SelectItem value="landscapePanRight">Landscape Pan Right</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Architecture Effects</SelectLabel>
                        <SelectItem value="architectureRise">Architecture Rise</SelectItem>
                        <SelectItem value="architectureDescend">Architecture Descend</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Dynamic Effects</SelectLabel>
                        <SelectItem value="dramaticZoomIn">Dramatic Zoom In</SelectItem>
                        <SelectItem value="dramaticZoomOut">Dramatic Zoom Out</SelectItem>
                        <SelectItem value="zoomInPanLeft">Zoom In + Pan Left</SelectItem>
                        <SelectItem value="zoomInPanRight">Zoom In + Pan Right</SelectItem>
                        <SelectItem value="zoomInPanUp">Zoom In + Pan Up</SelectItem>
                        <SelectItem value="zoomInPanDown">Zoom In + Pan Down</SelectItem>
                        <SelectItem value="diagonalZoomInUpRight">Diagonal Zoom Up-Right</SelectItem>
                        <SelectItem value="diagonalZoomInDownLeft">Diagonal Zoom Down-Left</SelectItem>
                        <SelectItem value="energeticReveal">Energetic Reveal</SelectItem>
                      </SelectGroup>
                      <SelectGroup>
                        <SelectLabel>Technical Effects</SelectLabel>
                        <SelectItem value="technicalSubtleZoom">Technical Subtle Zoom</SelectItem>
                        <SelectItem value="technicalPanRight">Technical Pan Right</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Changes preview in real-time on the left
                  </p>
                </div>

                <div className="flex gap-2 pt-4">
                  <Button className="flex-1" onClick={handleSaveEffect} disabled={!hasEffectChanges}>
                    Save Changes
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={handleResetEffect}
                    disabled={!hasEffectChanges}
                  >
                    Reset
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ImagePreviewModal
        isOpen={isReviewOpen && !!preview}
        imageAsset={preview?.imageAsset ?? null}
        imageUrl={previewImageUrl}
        onAccept={acceptPreview}
        onReject={rejectPreview}
        onClose={closeReview}
        isDecisionPending={isDecisionPending}
      />
    </>
  );
}
