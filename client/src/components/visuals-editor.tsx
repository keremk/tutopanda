import { useState, useEffect, useTransition } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { KenBurnsClip, ImageAsset } from "@/types/types";
import { imageModelValues } from "@/lib/models";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import EffectPreview from "./effect-preview";
import { kenBurnsEffects } from "@/lib/timeline/ken-burns";
import { regenerateImageAction } from "@/app/actions/regenerate-image";

interface VisualsEditorProps {
  selectedClipId: string | null;
}

export default function VisualsEditor({ selectedClipId }: VisualsEditorProps) {
  const { timeline, content, updateTimeline, lectureId, updatedAt } = useLectureEditor();
  const [isGenerating, startTransition] = useTransition();

  // Find the selected clip
  const selectedClip = timeline?.tracks.visual.find(
    (clip) => clip.id === selectedClipId
  ) as KenBurnsClip | undefined;

  // Find the corresponding image asset
  const imageAsset = selectedClip?.imageAssetId
    ? content.images?.find((img) => img.id === selectedClip.imageAssetId)
    : undefined;

  // Local state for pending changes
  const [localEffectName, setLocalEffectName] = useState<string>("");
  const [localPrompt, setLocalPrompt] = useState<string>("");
  const [localModel, setLocalModel] = useState<string>("");

  // Reset local state when clip changes
  useEffect(() => {
    if (selectedClip) {
      setLocalEffectName(selectedClip.effectName || "");
      setLocalPrompt(imageAsset?.prompt || "");
      setLocalModel(imageAsset?.model || content.config?.image?.model || "");
    }
  }, [selectedClipId, selectedClip, imageAsset, content.config?.image?.model]);

  // Check if there are unsaved effect changes
  const hasEffectChanges = selectedClip && localEffectName !== (selectedClip.effectName || "");

  // Get image URL for preview with cache-busting
  const imageUrl = selectedClip?.imageUrl || (imageAsset?.sourceUrl
    ? `/api/storage/${imageAsset.sourceUrl}?v=${updatedAt.getTime()}`
    : "");

  // Debug logging
  useEffect(() => {
    console.log("Visuals Editor - Selected Clip:", selectedClip);
    console.log("Visuals Editor - Image Asset:", imageAsset);
    console.log("Visuals Editor - Image URL:", imageUrl);
  }, [selectedClip, imageAsset, imageUrl]);

  const handleSaveEffect = () => {
    if (!selectedClip || !timeline) return;

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
  };

  const handleResetEffect = () => {
    if (selectedClip) {
      setLocalEffectName(selectedClip.effectName || "");
    }
  };

  const handleGenerateImage = () => {
    if (!imageAsset || !localPrompt.trim()) {
      return;
    }

    startTransition(async () => {
      try {
        await regenerateImageAction({
          lectureId,
          imageAssetId: imageAsset.id,
          prompt: localPrompt,
          model: localModel || undefined,
        });
      } catch (error) {
        console.error("Failed to generate image:", error);
      }
    });
  };

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
    <div className="h-full flex gap-6 bg-background">
      {/* Left: Effect Preview */}
      <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border border-border overflow-hidden">
        {imageUrl && imageUrl.trim() !== "" ? (
          <EffectPreview
            clip={selectedClip}
            imageUrl={imageUrl}
            effectName={localEffectName}
          />
        ) : (
          <div className="text-center text-muted-foreground">
            <p>No image available</p>
            <p className="text-xs mt-2">Selected clip: {selectedClip.name}</p>
            <p className="text-xs">Image URL: {imageUrl || "none"}</p>
          </div>
        )}
      </div>

      {/* Right: Tabs Panel */}
      <div className="w-96 h-full flex-shrink-0">
        <Tabs defaultValue="image" className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="image">Image</TabsTrigger>
            <TabsTrigger value="effects">Effects</TabsTrigger>
          </TabsList>

          {/* Image Tab */}
          <TabsContent value="image" className="flex-1 overflow-y-auto">
            <div className="space-y-6 p-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Image Settings</h3>
              </div>

              {/* Prompt Field */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Image Prompt</label>
                <textarea
                  className="w-full min-h-24 p-2 border rounded-md resize-none"
                  value={localPrompt}
                  onChange={(e) => setLocalPrompt(e.target.value)}
                  placeholder="Describe the image..."
                  disabled={!imageAsset}
                />
              </div>

              {/* AI Model Select */}
              <div className="space-y-2">
                <label className="text-sm font-medium">AI Model</label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={localModel}
                  onChange={(e) => setLocalModel(e.target.value)}
                  disabled={!imageAsset}
                >
                  <option value="" disabled>Select a model...</option>
                  {imageModelValues.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  {imageAsset?.model ? "Override model" : content.config?.image?.model ? `Using config: ${content.config.image.model}` : "No model configured"}
                </p>
              </div>

              {/* Generate Button */}
              <div className="pt-4">
                <Button
                  className="w-full"
                  disabled={!imageAsset || !localPrompt.trim() || isGenerating}
                  onClick={handleGenerateImage}
                >
                  {isGenerating ? "Generating..." : "Generate Image"}
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  {isGenerating
                    ? "Generating new image with AI..."
                    : "Generate a new image to replace the current one"}
                </p>
              </div>
            </div>
          </TabsContent>

          {/* Effects Tab */}
          <TabsContent value="effects" className="flex-1 overflow-y-auto">
            <div className="space-y-6 p-4">
              <div>
                <h3 className="text-lg font-semibold mb-4">Effect Settings</h3>
              </div>

              {/* Ken Burns Effect Select */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Ken Burns Effect</label>
                <select
                  className="w-full p-2 border rounded-md"
                  value={localEffectName}
                  onChange={(e) => setLocalEffectName(e.target.value)}
                >
                  <option value="" disabled>Select an effect...</option>
                  <optgroup label="Portrait Effects">
                    <option value="portraitZoomIn">Portrait Zoom In</option>
                    <option value="portraitZoomOut">Portrait Zoom Out</option>
                  </optgroup>
                  <optgroup label="Landscape Effects">
                    <option value="landscapePanLeft">Landscape Pan Left</option>
                    <option value="landscapePanRight">Landscape Pan Right</option>
                  </optgroup>
                  <optgroup label="Architecture Effects">
                    <option value="architectureRise">Architecture Rise</option>
                    <option value="architectureDescend">Architecture Descend</option>
                  </optgroup>
                  <optgroup label="Dynamic Effects">
                    <option value="dramaticZoomIn">Dramatic Zoom In</option>
                    <option value="dramaticZoomOut">Dramatic Zoom Out</option>
                    <option value="zoomInPanLeft">Zoom In + Pan Left</option>
                    <option value="zoomInPanRight">Zoom In + Pan Right</option>
                    <option value="zoomInPanUp">Zoom In + Pan Up</option>
                    <option value="zoomInPanDown">Zoom In + Pan Down</option>
                    <option value="diagonalZoomInUpRight">Diagonal Zoom Up-Right</option>
                    <option value="diagonalZoomInDownLeft">Diagonal Zoom Down-Left</option>
                    <option value="energeticReveal">Energetic Reveal</option>
                  </optgroup>
                  <optgroup label="Technical Effects">
                    <option value="technicalSubtleZoom">Technical Subtle Zoom</option>
                    <option value="technicalPanRight">Technical Pan Right</option>
                  </optgroup>
                </select>
                <p className="text-xs text-muted-foreground">
                  Changes preview in real-time on the left
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 pt-4">
                <Button
                  className="flex-1"
                  onClick={handleSaveEffect}
                  disabled={!hasEffectChanges}
                >
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
  );
}
