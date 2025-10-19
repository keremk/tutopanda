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
import { regenerateVideoSegmentAction } from "@/app/actions/regenerate-video-segment";
import { acceptVideoAction } from "@/app/actions/accept-video";
import { rejectVideoAction } from "@/app/actions/reject-video";
import { regenerateVideoStartingImageAction } from "@/app/actions/regenerate-video-starting-image";
import { acceptVideoStartingImageAction } from "@/app/actions/accept-video-starting-image";
import { rejectVideoStartingImageAction } from "@/app/actions/reject-video-starting-image";
import ImagePreviewModal from "@/components/image-preview-modal";
import VideoPreviewModal from "@/components/video-preview-modal";
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
    isGenerating: isImageGenerating,
    isReviewOpen: isImageReviewOpen,
    isDecisionPending: isImageDecisionPending,
    error: imageGenerationError,
    preview: imagePreview,
    previewVersion: imagePreviewVersion,
    startGeneration: startImageGeneration,
    openReview: openImageReview,
    closeReview: closeImageReview,
    acceptPreview: acceptImagePreview,
    rejectPreview: rejectImagePreview,
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

  const {
    isGenerating: isVideoGenerating,
    isReviewOpen: isVideoReviewOpen,
    isDecisionPending: isVideoDecisionPending,
    error: videoGenerationError,
    preview: videoPreview,
    previewVersion: videoPreviewVersion,
    startGeneration: startVideoGeneration,
    openReview: openVideoReview,
    closeReview: closeVideoReview,
    acceptPreview: acceptVideoPreview,
    rejectPreview: rejectVideoPreview,
  } = useAssetGenerationFlow<VideoAsset>({
    assetType: "video",
    lectureId,
    assetId: videoAsset?.id ?? null,
    onRegenerate: async () =>
      regenerateVideoSegmentAction({
        lectureId,
        videoAssetId: videoAsset!.id,
        movieDirections: draft.movieDirections,
        model: draft.model || undefined,
      }),
    onAccept: (runId, assetId) =>
      acceptVideoAction({ runId, videoAssetId: assetId }).then(() => undefined),
    onReject: (runId, assetId) =>
      rejectVideoAction({ runId, videoAssetId: assetId }).then(() => undefined),
    previewMessageType: "video-preview",
    completeMessageType: "video-complete",
    extractPreview: (message) =>
      message.type === "video-preview"
        ? { preview: message.videoAsset, assetId: message.videoAssetId }
        : null,
    mapPreviewToAssetUpdate: (videoAssetPreview) => ({
      movieDirections: videoAssetPreview.movieDirections,
      model: videoAssetPreview.model,
      resolution: videoAssetPreview.resolution,
      duration: videoAssetPreview.duration,
      aspectRatio: videoAssetPreview.aspectRatio,
      videoPath: videoAssetPreview.videoPath,
    }),
    onPreviewAccepted: (videoAssetPreview) => {
      setDraft((prev) => ({
        ...prev,
        movieDirections: videoAssetPreview.movieDirections ?? prev.movieDirections,
        model: videoAssetPreview.model ?? prev.model,
      }));
    },
    refreshOnAccept: false,
    refreshOnComplete: true,
  });

  const committedVideoUrl = useMemo(() => {
    if (!videoAsset) return undefined;
    return buildVideoAssetUrl(videoAsset, { updatedAt });
  }, [videoAsset, updatedAt]);

  const committedStartingImageUrl = useMemo(() => {
    if (!videoAsset) return "";
    return buildStartingImageUrl(videoAsset, { updatedAt }) ?? "";
  }, [videoAsset, updatedAt]);

  const previewStartingImageUrl = useMemo(() => {
    if (!imagePreview) return "";
    return buildStartingImageUrl(imagePreview, { previewToken: imagePreviewVersion }) ?? "";
  }, [imagePreview, imagePreviewVersion]);

  const previewImageAsset = useMemo(() => {
    if (!imagePreview) return null;
    return {
      id: imagePreview.startingImageId ?? `${imagePreview.id}-starting`,
      prompt: imagePreview.segmentStartImagePrompt ?? draft.segmentStartImagePrompt,
      model: imagePreview.startingImageModel ?? draft.startingImageModel ?? DEFAULT_IMAGE_MODEL,
      style: projectSettings.image.style ?? DEFAULT_IMAGE_GENERATION_DEFAULTS.style,
      sourceUrl: "",
      label: imagePreview.label ?? videoAsset?.label ?? "Starting Image",
    } as ImageAsset;
  }, [
    imagePreview,
    draft.segmentStartImagePrompt,
    draft.startingImageModel,
    projectSettings.image.style,
    videoAsset?.label,
  ]);

  const previewVideoAsset = useMemo(() => {
    if (!videoPreview) return null;
    return {
      ...videoPreview,
      movieDirections: videoPreview.movieDirections ?? draft.movieDirections,
      model: videoPreview.model ?? draft.model,
    };
  }, [videoPreview, draft.movieDirections, draft.model]);

  const previewVideoUrl = useMemo(() => {
    if (!videoPreview) return "";
    return buildVideoAssetUrl(videoPreview, { previewToken: videoPreviewVersion }) ?? "";
  }, [videoPreview, videoPreviewVersion]);

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

  const imageButtonLabel = useMemo(() => {
    if (isImageGenerating) return "Generating...";
    if (imagePreview) return "Review Starting Image";
    return "Generate Starting Image";
  }, [isImageGenerating, imagePreview]);

  const imageButtonDisabled = useMemo(() => {
    if (!videoAsset) return true;
    if (isImageGenerating || isImageDecisionPending) return true;
    if (imagePreview) return false;
    return draft.segmentStartImagePrompt.trim().length === 0;
  }, [
    videoAsset,
    isImageGenerating,
    isImageDecisionPending,
    imagePreview,
    draft.segmentStartImagePrompt,
  ]);

  const imageHelperText = useMemo(() => {
    if (imageGenerationError) return imageGenerationError;
    if (isImageDecisionPending) return "Finalizing your choice...";
    if (isImageGenerating) return "Generating a new starting image with AI...";
    if (imagePreview) return "Review the generated starting image before accepting it.";
    return "Generate a new starting image to replace the current one.";
  }, [imageGenerationError, isImageDecisionPending, isImageGenerating, imagePreview]);

  const imageHelperClassName = useMemo(
    () =>
      imageGenerationError
        ? "text-xs text-destructive mt-2"
        : "text-xs text-muted-foreground mt-2",
    [imageGenerationError]
  );

  const videoButtonLabel = useMemo(() => {
    if (isVideoGenerating) return "Generating...";
    if (videoPreview) return "Review Video";
    return "Regenerate Video";
  }, [isVideoGenerating, videoPreview]);

  const videoButtonDisabled = useMemo(() => {
    if (!videoAsset) return true;
    if (isVideoGenerating || isVideoDecisionPending) return true;
    if (videoPreview) return false;
    return draft.movieDirections.trim().length === 0;
  }, [
    videoAsset,
    isVideoGenerating,
    isVideoDecisionPending,
    videoPreview,
    draft.movieDirections,
  ]);

  const videoHelperText = useMemo(() => {
    if (videoGenerationError) return videoGenerationError;
    if (isVideoDecisionPending) return "Finalizing your choice...";
    if (isVideoGenerating) return "Generating a new video segment with AI...";
    if (videoPreview) return "Review the regenerated video before accepting it.";
    return "Regenerate the video for this segment using the updated directions.";
  }, [videoGenerationError, isVideoDecisionPending, isVideoGenerating, videoPreview]);

  const videoHelperClassName = useMemo(
    () =>
      videoGenerationError
        ? "text-xs text-destructive mt-2"
        : "text-xs text-muted-foreground mt-2",
    [videoGenerationError]
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
        isOpen={isImageReviewOpen && !!imagePreview}
        imageAsset={previewImageAsset}
        imageUrl={previewStartingImageUrl || committedStartingImageUrl}
        onAccept={() => void acceptImagePreview()}
        onReject={() => void rejectImagePreview()}
        onClose={closeImageReview}
        isDecisionPending={isImageDecisionPending}
      />
      <VideoPreviewModal
        isOpen={isVideoReviewOpen && !!previewVideoAsset}
        videoAsset={previewVideoAsset}
        videoUrl={previewVideoUrl || committedVideoUrl || ""}
        onAccept={() => void acceptVideoPreview()}
        onReject={() => void rejectVideoPreview()}
        onClose={closeVideoReview}
        isDecisionPending={isVideoDecisionPending}
      />
      <div className="h-full flex gap-6 bg-background">
        <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border border-border overflow-hidden">
        {activeTab === "video" ? (
          committedVideoUrl ? (
            <video
              key={committedVideoUrl}
              src={committedVideoUrl}
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
                <Button
                  className="w-full"
                  disabled={videoButtonDisabled}
                  onClick={() => {
                    if (videoPreview) {
                      openVideoReview();
                    } else {
                      void startVideoGeneration();
                    }
                  }}
                >
                  {videoButtonLabel}
                </Button>
                <p className={videoHelperClassName}>{videoHelperText}</p>
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
                  disabled={imageButtonDisabled}
                  onClick={() => {
                    if (imagePreview) {
                      openImageReview();
                    } else {
                      void startImageGeneration();
                    }
                  }}
                >
                  {imageButtonLabel}
                </Button>
                <p className={imageHelperClassName}>{imageHelperText}</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
      </div>
    </>
  );
}
