import { useLectureEditor } from "./lecture-editor-provider";
import type { KenBurnsClip, ImageAsset } from "@/types/types";

interface VisualsEditorProps {
  selectedClipId: string | null;
}

export default function VisualsEditor({ selectedClipId }: VisualsEditorProps) {
  const { timeline, content } = useLectureEditor();

  // Find the selected clip
  const selectedClip = timeline?.tracks.visual.find(
    (clip) => clip.id === selectedClipId
  ) as KenBurnsClip | undefined;

  // Find the corresponding image asset
  const imageAsset = selectedClip?.imageAssetId
    ? content.images?.find((img) => img.id === selectedClip.imageAssetId)
    : undefined;

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
      {/* Left: Image Preview */}
      <div className="flex-1 flex items-center justify-center bg-muted/30 rounded-lg border border-border">
        {selectedClip.imageUrl || imageAsset?.sourceUrl ? (
          <img
            src={selectedClip.imageUrl || `/api/storage/${imageAsset?.sourceUrl}`}
            alt={selectedClip.name}
            className="max-w-full max-h-full object-contain rounded"
          />
        ) : (
          <div className="text-center text-muted-foreground">
            <p>No image available</p>
          </div>
        )}
      </div>

      {/* Right: Settings Panel (Scrollable) */}
      <div className="w-96 h-full flex-shrink-0 overflow-y-auto">
        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-semibold mb-4">Visual Settings</h3>
          </div>

          {/* Prompt Field */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Image Prompt</label>
            <textarea
              className="w-full min-h-24 p-2 border rounded-md resize-none"
              defaultValue={imageAsset?.prompt || ""}
              placeholder="Describe the image..."
              disabled={!imageAsset}
            />
          </div>

          {/* AI Model Select */}
          <div className="space-y-2">
            <label className="text-sm font-medium">AI Model</label>
            <select
              className="w-full p-2 border rounded-md"
              defaultValue={imageAsset?.model || "default"}
              disabled={!imageAsset}
            >
              <option value="default">(Default: {content.config?.image?.model || "NanoBanana"})</option>
              <option value="NanoBanana">NanoBanana</option>
              <option value="SeaDream">SeaDream</option>
              <option value="QWEN Image">QWEN Image</option>
            </select>
          </div>

          {/* Ken Burns Effect Select */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Ken Burns Effect</label>
            <select
              className="w-full p-2 border rounded-md"
              defaultValue={selectedClip.effectName || ""}
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
          </div>

          {/* Regenerate Button (Placeholder) */}
          <div className="pt-4">
            <button
              className="w-full py-2 px-4 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
              disabled={!imageAsset}
            >
              Regenerate Image
            </button>
            <p className="text-xs text-muted-foreground mt-2">
              Image regeneration will be available through the agent panel
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
