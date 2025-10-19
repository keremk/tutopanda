import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { VideoAsset } from "@/types/types";

interface VideoPreviewModalProps {
  isOpen: boolean;
  videoAsset: VideoAsset | null;
  videoUrl: string;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
  isDecisionPending?: boolean;
}

export default function VideoPreviewModal({
  isOpen,
  videoAsset,
  videoUrl,
  onAccept,
  onReject,
  onClose,
  isDecisionPending = false,
}: VideoPreviewModalProps) {
  if (!videoAsset) {
    return null;
  }

  const durationLabel =
    typeof videoAsset.duration === "number" ? `${Math.round(videoAsset.duration)}s` : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>Preview Generated Video</DialogTitle>
          <DialogDescription>
            Review the regenerated video segment before accepting it. Accepting will overwrite the existing video.
          </DialogDescription>
        </DialogHeader>

        <div className="w-full bg-muted rounded-lg overflow-hidden">
          {videoUrl ? (
            <video
              src={videoUrl}
              controls
              className="w-full h-auto bg-black"
              data-testid="video-preview-player"
            />
          ) : (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
              <p>No video preview available</p>
            </div>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label className="text-sm font-medium">Movie Directions</label>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap bg-muted rounded-md p-3 max-h-48 overflow-y-auto">
              {videoAsset.movieDirections}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {videoAsset.model && (
              <div>
                <label className="font-medium">Model</label>
                <p className="text-muted-foreground">{videoAsset.model}</p>
              </div>
            )}

            {videoAsset.resolution && (
              <div>
                <label className="font-medium">Resolution</label>
                <p className="text-muted-foreground">{videoAsset.resolution}</p>
              </div>
            )}

            {videoAsset.aspectRatio && (
              <div>
                <label className="font-medium">Aspect Ratio</label>
                <p className="text-muted-foreground">{videoAsset.aspectRatio}</p>
              </div>
            )}

            {durationLabel && (
              <div>
                <label className="font-medium">Duration</label>
                <p className="text-muted-foreground">{durationLabel}</p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onReject} disabled={isDecisionPending}>
            Reject
          </Button>
          <Button onClick={onAccept} disabled={isDecisionPending}>
            {isDecisionPending ? "Saving..." : "Accept & Replace Video"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
