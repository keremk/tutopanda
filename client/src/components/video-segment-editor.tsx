"use client";

import { useMemo, useState } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { VideoClip, VideoAsset, ImageAsset } from "@/types/types";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { videoModelOptions, imageModelOptions, DEFAULT_VIDEO_MODEL, DEFAULT_IMAGE_MODEL } from "@/lib/models";
import { useAssetDraft } from "@/hooks/use-asset-draft";
import { useAssetGenerationFlow } from "@/hooks/use-asset-generation-flow";
import { buildVideoAssetUrl, buildStartingImageUrl } from "@/lib/video-assets";
import { regenerateVideoStartingImageAction } from "@/app/actions/regenerate-video-starting-image";
import { acceptVideoStartingImageAction } from "@/app/actions/accept-video-starting-image";
import { rejectVideoStartingImageAction } from "@/app/actions/reject-video-starting-image";
import ImagePreviewModal from "@/components/image-preview-modal";
import { DEFAULT_IMAGE_GENERATION_DEFAULTS } from "@/types/types";

interface VideoSegmentEditorProps {
  selectedClipId: string | null;
}

type VideoDraftState = {
  movieDirections: string;
  model: string;
  segmentStartImagePrompt: string;
  startingImageModel: string;
};

export default function VideoSegmentEditor({ selectedClipId }: VideoSegmentEditorProps) {
  const {
    lectureId,
    timeline,
    content,
    updatedAt,
    projectSettings,
  } = useLectureEditor();
  const [activeTab, setActiveTab] = useState<"video" | "image">("video");

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return null;
    return (
      (timeline?.tracks.visual.find(
        (clip) => clip.id === selectedClipId && clip.kind === "video"
      ) as VideoClip | undefined) ?? null
    );
  }, [timeline, selectedClipId]);

  const videoAsset = useMemo(() => {
    if (!selectedClip?.videoAssetId) {
      return undefined;
    }
    const videos = content.videos ?? [];
    return videos.find((video) => video.id === selectedClip.videoAssetId);
  }, [content.videos, selectedClip]);

  const baseDraft = useMemo<VideoDraftState>(
    () => ({
      movieDirections: videoAsset?.movieDirections ?? "",
      model: videoAsset?.model ?? DEFAULT_VIDEO_MODEL,
      segmentStartImagePrompt: videoAsset?.segmentStartImagePrompt ?? "",
      startingImageModel:
        videoAsset?.startingImageModel ??
        projectSettings.video.imageModel ??
        projectSettings.image.model ??
        DEFAULT_IMAGE_MODEL,
    }),
    [
      videoAsset?.movieDirections,
      videoAsset?.model,
      videoAsset?.segmentStartImagePrompt,
      videoAsset?.startingImageModel,
      projectSettings.video.imageModel,
      projectSettings.image.model,
    ]
  );

  const { draft, setDraft } = useAssetDraft<VideoDraftState>({
    assetId: videoAsset?.id ?? null,
    baseDraft,
  });

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
  } = useAssetGenerationFlow<VideoAsset>({
    assetType: "video",
    lectureId,
    assetId: videoAsset?.id ?? null,
    onRegenerate: async () =>
      regenerateVideoStartingImageAction({
        lectureId,
        videoAssetId: videoAsset!.id,
        segmentStartImagePrompt: draft.segmentStartImagePrompt,
        imageModel: draft.startingImageModel || undefined,
      }),
    onAccept: (runId, assetId) =>
      acceptVideoStartingImageAction({ runId, videoAssetId: assetId }).then(() => undefined),
    onReject: (runId, assetId) =>
      rejectVideoStartingImageAction({ runId, videoAssetId: assetId }).then(() => undefined),
    previewMessageType: "video-image-preview",
    completeMessageType: "video-image-complete",
    extractPreview: (message) =>
      message.type === "video-image-preview"
        ? { preview: message.videoAsset, assetId: message.videoAssetId }
        : null,
    mapPreviewToAssetUpdate: (videoPreview) => ({
      segmentStartImagePrompt: videoPreview.segmentStartImagePrompt,
      startingImageModel: videoPreview.startingImageModel,
      startingImageId: videoPreview.startingImageId,
      videoPath: videoPreview.videoPath,
    }),
    onPreviewAccepted: (videoPreview) => {
      setDraft((prev) => ({
        ...prev,
        segmentStartImagePrompt:
          videoPreview.segmentStartImagePrompt ?? prev.segmentStartImagePrompt,
        startingImageModel: videoPreview.startingImageModel ?? prev.startingImageModel,
      }));
    },
    refreshOnAccept: false,
    refreshOnComplete: true,
  });

  const videoUrl = useMemo(() => {
    if (!videoAsset) return undefined;
    return buildVideoAssetUrl(videoAsset, { updatedAt });
  }, [videoAsset, updatedAt]);

  const committedStartingImageUrl = useMemo(() => {
    if (!videoAsset) return "";
    return buildStartingImageUrl(videoAsset, { updatedAt }) ?? "";
  }, [videoAsset, updatedAt]);

  const previewStartingImageUrl = useMemo(() => {
    if (!preview) return "";
    return buildStartingImageUrl(preview, { previewToken: previewVersion }) ?? "";
  }, [preview, previewVersion]);

  const previewImageAsset = useMemo(() => {
    if (!preview) return null;
    return {
      id: preview.startingImageId ?? `${preview.id}-starting`,
      prompt: preview.segmentStartImagePrompt ?? draft.segmentStartImagePrompt,
      model: preview.startingImageModel ?? draft.startingImageModel ?? DEFAULT_IMAGE_MODEL,
      style: projectSettings.image.style ?? DEFAULT_IMAGE_GENERATION_DEFAULTS.style,
      sourceUrl: "",
      label: preview.label ?? videoAsset?.label ?? "Starting Image",
    } as ImageAsset;
  }, [
    preview,
    draft.segmentStartImagePrompt,
    draft.startingImageModel,
    projectSettings.image.style,
    videoAsset?.label,
  ]);

  const handleMovieDirectionsChange = (value: string) => {
    setDraft((prev) => ({ ...prev, movieDirections: value }));
  };

  const handleModelChange = (value: string) => {
    setDraft((prev) => ({ ...prev, model: value }));
  };

  const handleStartingImagePromptChange = (value: string) => {
    setDraft((prev) => ({ ...prev, segmentStartImagePrompt: value }));
  };

  const handleStartingImageModelChange = (value: string) => {
    setDraft((prev) => ({ ...prev, startingImageModel: value }));
  };

  const buttonLabel = useMemo(() => {
    if (isGenerating) return "Generating...";
    if (preview) return "Review Starting Image";
    return "Generate Starting Image";
  }, [isGenerating, preview]);

  const buttonDisabled = useMemo(() => {
    if (!videoAsset) return true;
    if (isGenerating || isDecisionPending) return true;
    if (preview) return false;
    return draft.segmentStartImagePrompt.trim().length === 0;
  }, [videoAsset, isGenerating, isDecisionPending, preview, draft.segmentStartImagePrompt]);

  const helperText = useMemo(() => {
    if (generationError) return generationError;
    if (isDecisionPending) return "Finalizing your choice...";
    if (isGenerating) return "Generating a new starting image with AI...";
    if (preview) return "Review the generated starting image before accepting it.";
    return "Generate a new starting image to replace the current one.";
  }, [generationError, isDecisionPending, isGenerating, preview]);

  const helperClassName = useMemo(
    () => (generationError ? "text-xs text-destructive mt-2" : "text-xs text-muted-foreground mt-2"),
    [generationError]
  );

  if (!selectedClipId || !selectedClip || !videoAsset) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30 rounded-lg border border-border">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Video Segment Editor</h3>
          <p className="text-muted-foreground">
            Select a video clip from the timeline below
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <ImagePreviewModal
        isOpen={isReviewOpen && !!preview}
        imageAsset={previewImageAsset}
        imageUrl={previewStartingImageUrl || committedStartingImageUrl}
        onAccept={() => void acceptPreview()}
        onReject={() => void rejectPreview()}
        onClose={closeReview}
        isDecisionPending={isDecisionPending}
      />
      <div className="h-full flex gap-6 bg-background">
        <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border border-border overflow-hidden">
        {activeTab === "video" ? (
          videoUrl ? (
            <video
              key={videoUrl}
              src={videoUrl}
              className="h-full w-full object-contain bg-black"
              autoPlay
              loop
              muted
              controls
            />
          ) : (
            <div className="text-center text-muted-foreground space-y-2">
              <p>No video available</p>
              <p className="text-xs">Selected clip: {selectedClip.name}</p>
            </div>
          )
        ) : committedStartingImageUrl ? (
          <img
            src={committedStartingImageUrl}
            alt={videoAsset.segmentStartImagePrompt || selectedClip.name}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <div className="text-center text-muted-foreground space-y-2">
            <p>No starting image available</p>
            <p className="text-xs">Selected clip: {selectedClip.name}</p>
          </div>
        )}
        </div>

        <div className="w-96 h-full flex-shrink-0">
          <Tabs
            value={activeTab}
            onValueChange={(value) => setActiveTab(value as "video" | "image")}
            className="h-full flex flex-col"
          >
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="video">Video Generation</TabsTrigger>
            <TabsTrigger value="image">Starting Image</TabsTrigger>
          </TabsList>

          <TabsContent value="video" className="flex-1 overflow-y-auto">
            <div className="space-y-6 p-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Video Generation</h3>
                <p className="text-sm text-muted-foreground">
                  Adjust the movie directions prompt or override the model before regenerating this video segment.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="video-prompt">Movie Directions</Label>
                <Textarea
                  id="video-prompt"
                  className="min-h-32 resize-none"
                  value={draft.movieDirections}
                  onChange={(e) => handleMovieDirectionsChange(e.target.value)}
                  placeholder="Describe the scene direction for this segment..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="video-model">Video Model</Label>
                <Select
                  value={draft.model}
                  onValueChange={handleModelChange}
                >
                  <SelectTrigger id="video-model">
                    <SelectValue placeholder="Select a model..." />
                  </SelectTrigger>
                  <SelectContent>
                    {videoModelOptions.map((option) => (
                      <SelectItem key={option.id} value={option.id}>
                        {option.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Using {draft.model === videoAsset.model ? "the current" : "an override"} model for regeneration.
                </p>
              </div>

              <div className="pt-4">
                <Button className="w-full" disabled>
                  Regenerate Video (coming soon)
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  Regeneration actions will be enabled in a future update.
                </p>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="image" className="flex-1 overflow-y-auto">
            <div className="space-y-6 p-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Starting Image</h3>
                <p className="text-sm text-muted-foreground">
                  Update the prompt used to generate the starting image for this segment.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="starting-image-prompt">Starting Image Prompt</Label>
                <Textarea
                  id="starting-image-prompt"
                  className="min-h-32 resize-none"
                  value={draft.segmentStartImagePrompt}
                  onChange={(e) => handleStartingImagePromptChange(e.target.value)}
                  placeholder="Describe the starting image for this video..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="starting-image-model">Image Model</Label>
                <Select
                  value={draft.startingImageModel}
                  onValueChange={handleStartingImageModelChange}
                >
                  <SelectTrigger id="starting-image-model">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {imageModelOptions.map((model) => (
                      <SelectItem key={model.id} value={model.id}>
                        {model.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Used to regenerate the starting image for this video segment.
                </p>
              </div>

              <div className="pt-4">
                <Button
                  className="w-full"
                  disabled={buttonDisabled}
                  onClick={() => {
                    if (preview) {
                      openReview();
                    } else {
                      void startGeneration();
                    }
                  }}
                >
                  {buttonLabel}
                </Button>
                <p className={helperClassName}>{helperText}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </>
  );
}
