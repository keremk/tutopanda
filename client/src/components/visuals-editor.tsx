import { useState, useEffect, useTransition } from "react";
import { useLectureEditor } from "./lecture-editor-provider";
import type { KenBurnsClip, ImageAsset } from "@/types/types";
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
import EffectPreview from "./effect-preview";
import { kenBurnsEffects } from "@/lib/timeline/ken-burns";
import { regenerateImageAction } from "@/app/actions/regenerate-image";

interface VisualsEditorProps {
  selectedClipId: string | null;
}

export default function VisualsEditor({ selectedClipId }: VisualsEditorProps) {
  const { timeline, content, updateTimeline, lectureId, updatedAt, projectSettings } = useLectureEditor();
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
      setLocalModel(imageAsset?.model || projectSettings.image.model || "");
    }
  }, [selectedClipId, selectedClip, imageAsset, projectSettings.image.model]);

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
                <Label htmlFor="image-prompt">Image Prompt</Label>
                <Textarea
                  id="image-prompt"
                  className="min-h-24 resize-none"
                  value={localPrompt}
                  onChange={(e) => setLocalPrompt(e.target.value)}
                  placeholder="Describe the image..."
                  disabled={!imageAsset}
                />
              </div>

              {/* AI Model Select */}
              <div className="space-y-2">
                <Label htmlFor="ai-model">AI Model</Label>
                <Select
                  value={localModel}
                  onValueChange={setLocalModel}
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
                  {imageAsset?.model ? "Override model" : projectSettings.image.model ? `Using project: ${projectSettings.image.model}` : "No model configured"}
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
