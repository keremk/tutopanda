import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import AudioPlayer from "@/components/audio-player";
import type { NarrationSettings, MusicSettings } from "@/types/types";

type AudioAsset = NarrationSettings | MusicSettings;

interface AudioPreviewModalProps {
  isOpen: boolean;
  audioAsset: AudioAsset | null;
  audioUrl: string;
  title: string;
  description: string;
  acceptLabel: string;
  rejectLabel?: string;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
  isDecisionPending?: boolean;
}

function isNarration(asset: AudioAsset): asset is NarrationSettings {
  return "sourceUrl" in asset;
}

export default function AudioPreviewModal({
  isOpen,
  audioAsset,
  audioUrl,
  title,
  description,
  acceptLabel,
  rejectLabel = "Reject",
  onAccept,
  onReject,
  onClose,
  isDecisionPending = false,
}: AudioPreviewModalProps) {
  if (!audioAsset) return null;

  const isNarrationAsset = isNarration(audioAsset);

  // Determine the prompt/script text
  const promptText = isNarrationAsset && audioAsset.finalScript
    ? audioAsset.finalScript
    : !isNarrationAsset && audioAsset.prompt
    ? audioAsset.prompt
    : null;

  // Calculate duration (both types have duration field)
  const duration = audioAsset.duration !== undefined ? audioAsset.duration : null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Audio Player */}
          {audioUrl ? (
            <AudioPlayer audioUrl={audioUrl} className="w-full" />
          ) : (
            <div className="flex items-center justify-center h-24 bg-muted rounded-lg text-muted-foreground">
              <p>No audio available</p>
            </div>
          )}

          {/* Display the prompt/script if available */}
          {promptText && (
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {isNarrationAsset ? "Script Used:" : "Prompt Used:"}
              </label>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap max-h-48 overflow-y-auto p-3 bg-muted rounded-md">
                {promptText}
              </p>
            </div>
          )}

          {/* Display model/voice info if available */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            {isNarrationAsset && audioAsset.model && (
              <div>
                <label className="font-medium">Model:</label>
                <p className="text-muted-foreground">{audioAsset.model}</p>
              </div>
            )}
            {isNarrationAsset && audioAsset.voice && (
              <div>
                <label className="font-medium">Voice:</label>
                <p className="text-muted-foreground">{audioAsset.voice}</p>
              </div>
            )}
            {!isNarrationAsset && audioAsset.type && (
              <div>
                <label className="font-medium">Type:</label>
                <p className="text-muted-foreground">{audioAsset.type}</p>
              </div>
            )}
            {duration !== null && (
              <div>
                <label className="font-medium">Duration:</label>
                <p className="text-muted-foreground">
                  {Math.round(duration)}s
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onReject}
            disabled={isDecisionPending}
          >
            {rejectLabel}
          </Button>
          <Button
            onClick={onAccept}
            disabled={isDecisionPending}
          >
            {isDecisionPending ? "Saving..." : acceptLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
