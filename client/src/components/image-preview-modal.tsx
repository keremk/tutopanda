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

        {imageAsset.prompt && (
          <div className="space-y-2">
            <label className="text-sm font-medium">Prompt Used:</label>
            <p className="text-sm text-muted-foreground">{imageAsset.prompt}</p>
          </div>
        )}

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
