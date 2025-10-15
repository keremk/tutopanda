import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ImageAsset } from "@/types/types";
import { buildStyledImagePrompt, getImageStyleMetadata } from "@/lib/image-styles";

interface ImagePreviewModalProps {
  isOpen: boolean;
  imageAsset: ImageAsset | null;
  imageUrl: string;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
  isDecisionPending?: boolean;
}

export default function ImagePreviewModal({
  isOpen,
  imageAsset,
  imageUrl,
  onAccept,
  onReject,
  onClose,
  isDecisionPending = false,
}: ImagePreviewModalProps) {
  if (!imageAsset) return null;

  const styleMetadata = getImageStyleMetadata(imageAsset.style);
  const finalPrompt = buildStyledImagePrompt({
    basePrompt: imageAsset.prompt ?? "",
    style: imageAsset.style,
  });

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Preview Generated Image</DialogTitle>
          <DialogDescription>
            Review the generated image before accepting it. This will replace the existing image.
          </DialogDescription>
        </DialogHeader>

        <div className="w-full bg-muted rounded-lg overflow-hidden">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt="Generated preview"
              className="w-full h-auto object-contain"
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <p>No image available</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {imageAsset.prompt && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Base Prompt</label>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {imageAsset.prompt}
              </p>
            </div>
          )}

          {styleMetadata && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Style</label>
              <p className="text-sm text-foreground">{styleMetadata.label}</p>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {styleMetadata.description}
              </p>
            </div>
          )}

          {styleMetadata && finalPrompt !== imageAsset.prompt && (
            <div className="space-y-1">
              <label className="text-sm font-medium">Final AI Prompt</label>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                {finalPrompt}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isDecisionPending}
          >
            Reject
          </Button>
          <Button
            onClick={onAccept}
            disabled={isDecisionPending}
          >
            {isDecisionPending ? "Saving..." : "Accept & Replace Image"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
