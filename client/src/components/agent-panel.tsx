"use client";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import {
  PromptInput,
  PromptInputBody,
  PromptInputTextarea,
  PromptInputToolbar,
  PromptInputTools,
  PromptInputSubmit,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionAddAttachments,
  PromptInputAttachments,
  PromptInputAttachment,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { AgentProgress } from "@/components/agent-progress";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import type { ChatStatus } from "ai";

import { sendPromptAction } from "@/app/actions/send-prompt";
import { acceptImageAction } from "@/app/actions/accept-image";
import { acceptNarrationAction } from "@/app/actions/accept-narration";
import { acceptMusicAction } from "@/app/actions/accept-music";
import {
  AgentPanelProvider,
  type AgentPanelTab,
  type TimelineSelection,
  type TimelineTrackType,
} from "@/hooks/use-agent-panel";
import type { LectureScript } from "@/prompts/create-script";
import type { ImageAsset, NarrationSettings, MusicSettings } from "@/types/types";
import ImagePreviewModal from "@/components/image-preview-modal";
import AudioPreviewModal from "@/components/audio-preview-modal";

interface AgentPanelProps {
  lectureId: number;
  className?: string;
  children: React.ReactNode;
}

export const AgentPanel = ({ lectureId, className, children }: AgentPanelProps) => {
  const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>();
  const [isPending, startTransition] = useTransition();
  const errorResetTimeout = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<AgentPanelTab>("video-preview");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [scriptsByRun, setScriptsByRun] = useState<Record<string, LectureScript>>({});
  const [debugTaskCount, setDebugTaskCount] = useState(0);
  const [timelineSelection, setTimelineSelection] = useState<TimelineSelection | null>(null);
  const [imagePreviewState, setImagePreviewState] = useState<{
    runId: string;
    imageAsset: ImageAsset;
    imageAssetId: string;
  } | null>(null);
  const [narrationPreviewState, setNarrationPreviewState] = useState<{
    runId: string;
    narrationAsset: NarrationSettings;
    narrationAssetId: string;
  } | null>(null);
  const [musicPreviewState, setMusicPreviewState] = useState<{
    runId: string;
    musicAsset: MusicSettings;
    musicAssetId: string;
  } | null>(null);

  useEffect(() => {
    return () => {
      if (errorResetTimeout.current) {
        window.clearTimeout(errorResetTimeout.current);
      }
    };
  }, []);

  const handlePromptSubmit = (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => {
    const prompt = message.text?.trim();

    if (!prompt || isPending) {
      return;
    }

    const formElement = event.currentTarget;
    setSubmitStatus("submitted");

    startTransition(() => {
      sendPromptAction({ prompt, lectureId })
        .then(() => {
          formElement.reset();
          setSubmitStatus(undefined);
        })
        .catch((error) => {
          console.error("Failed to send prompt", error);
          setSubmitStatus("error");
          if (errorResetTimeout.current) {
            window.clearTimeout(errorResetTimeout.current);
          }
          errorResetTimeout.current = window.setTimeout(() => {
            setSubmitStatus(undefined);
            errorResetTimeout.current = null;
          }, 2000);
        });
    });
  };

  const setRunScript = useCallback((runId: string, script: LectureScript) => {
    setScriptsByRun((previous) => ({ ...previous, [runId]: script }));
  }, []);

  const handleRunResult = useCallback(
    (runId: string, script: LectureScript) => {
      setRunScript(runId, script);
    },
    [setRunScript]
  );

  const handleOpenScript = useCallback(
    (runId: string) => {
      setSelectedRunId(runId);
      setActiveTab("narration");
    },
    [setActiveTab, setSelectedRunId]
  );

  const handleTimelineClipSelect = useCallback(
    (trackType: TimelineTrackType, clipId: string) => {
      setTimelineSelection({ trackType, clipId });

      // Auto-switch to appropriate tab based on track type
      const tabMap: Record<TimelineTrackType, AgentPanelTab> = {
        visual: "visuals",
        voice: "narration",
        music: "score",
      };
      setActiveTab(tabMap[trackType]);
    },
    [setActiveTab]
  );

  const handleImagePreview = useCallback(
    (runId: string, imageAsset: ImageAsset, imageAssetId: string) => {
      setImagePreviewState({ runId, imageAsset, imageAssetId });
    },
    []
  );

  const handleImageAccept = useCallback(
    (runId: string, imageAssetId: string) => {
      startTransition(() => {
        acceptImageAction({ runId, imageAssetId })
          .then(() => {
            setImagePreviewState(null);
          })
          .catch((error) => {
            console.error("Failed to accept image", error);
          });
      });
    },
    []
  );

  const handleNarrationPreview = useCallback(
    (runId: string, narrationAsset: NarrationSettings, narrationAssetId: string) => {
      setNarrationPreviewState({ runId, narrationAsset, narrationAssetId });
    },
    []
  );

  const handleNarrationAccept = useCallback(
    (runId: string, narrationAssetId: string) => {
      startTransition(() => {
        acceptNarrationAction({ runId, narrationAssetId })
          .then(() => {
            setNarrationPreviewState(null);
          })
          .catch((error) => {
            console.error("Failed to accept narration", error);
          });
      });
    },
    []
  );

  const handleMusicPreview = useCallback(
    (runId: string, musicAsset: MusicSettings, musicAssetId: string) => {
      setMusicPreviewState({ runId, musicAsset, musicAssetId });
    },
    []
  );

  const handleMusicAccept = useCallback(
    (runId: string, musicAssetId: string) => {
      startTransition(() => {
        acceptMusicAction({ runId, musicAssetId })
          .then(() => {
            setMusicPreviewState(null);
          })
          .catch((error) => {
            console.error("Failed to accept music", error);
          });
      });
    },
    []
  );

  const contextValue = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      selectedRunId,
      setSelectedRunId,
      scriptsByRun,
      setRunScript,
      timelineSelection,
      handleTimelineClipSelect,
    }),
    [activeTab, selectedRunId, scriptsByRun, setRunScript, timelineSelection, handleTimelineClipSelect]
  );

  return (
    <AgentPanelProvider value={contextValue}>
      <ResizablePanelGroup direction="horizontal" className={cn("h-full", className)}>
        <ResizablePanel defaultSize={70} minSize={50}>
          <div className="h-full">
            {children}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        <ResizablePanel defaultSize={30} minSize={25} maxSize={45}>
          <div className="h-full flex flex-col bg-[color:var(--surface-elevated)] border-l border-[color:var(--surface-border)]">
            {/* Header */}
            <div className="shrink-0 p-4 border-b border-[color:var(--surface-border)] flex items-center justify-between">
              <h2 className="text-sm font-medium text-foreground">Agent Progress</h2>
              {process.env.NODE_ENV === "development" && (
                <button
                  onClick={() => setDebugTaskCount((c) => c + 1)}
                  className="text-xs px-2 py-1 rounded bg-muted hover:bg-muted/80 text-muted-foreground"
                >
                  Add Task ({debugTaskCount})
                </button>
              )}
            </div>

            {/* Scrollable Content Area - Takes remaining space */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <AgentProgress
                lectureId={lectureId}
                onRunResult={handleRunResult}
                onViewScript={handleOpenScript}
                onImagePreview={handleImagePreview}
                onImageAccept={handleImageAccept}
                onNarrationPreview={handleNarrationPreview}
                onNarrationAccept={handleNarrationAccept}
                onMusicPreview={handleMusicPreview}
                onMusicAccept={handleMusicAccept}
                selectedRunId={selectedRunId}
                debugTaskCount={debugTaskCount}
              />
            </div>

            {/* AI Prompt Input - Fixed at Bottom */}
            <div className="shrink-0 border-t border-[color:var(--surface-border)] bg-[color:var(--surface-elevated)]/95">
              <div className="p-4">
                <PromptInput
                  onSubmit={handlePromptSubmit}
                  className="w-full border border-[color:var(--surface-border)] bg-[color:var(--surface-elevated)] shadow-sm"
                  maxFiles={5}
                  maxFileSize={10 * 1024 * 1024} // 10MB
                >
                  <PromptInputAttachments>
                    {(attachment) => <PromptInputAttachment data={attachment} />}
                  </PromptInputAttachments>

                  <PromptInputBody>
                    <PromptInputTextarea
                      placeholder="Ask the AI assistant..."
                      className="min-h-12"
                    />
                    <PromptInputToolbar>
                      <PromptInputTools>
                        <PromptInputActionMenu>
                          <PromptInputActionMenuTrigger />
                          <PromptInputActionMenuContent>
                            <PromptInputActionAddAttachments />
                          </PromptInputActionMenuContent>
                        </PromptInputActionMenu>
                      </PromptInputTools>
                      <PromptInputSubmit status={submitStatus} disabled={isPending} variant="secondary" />
                    </PromptInputToolbar>
                  </PromptInputBody>
                </PromptInput>
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      <ImagePreviewModal
        isOpen={imagePreviewState !== null}
        imageAsset={imagePreviewState?.imageAsset || null}
        onAccept={() => {
          if (imagePreviewState) {
            handleImageAccept(imagePreviewState.runId, imagePreviewState.imageAssetId);
          }
        }}
        onClose={() => setImagePreviewState(null)}
      />

      <AudioPreviewModal
        isOpen={narrationPreviewState !== null}
        audioAsset={narrationPreviewState?.narrationAsset || null}
        title="Preview Generated Narration"
        description="Review the generated narration before accepting it. This will replace the existing narration."
        acceptLabel="Accept & Replace Narration"
        onAccept={() => {
          if (narrationPreviewState) {
            handleNarrationAccept(narrationPreviewState.runId, narrationPreviewState.narrationAssetId);
          }
        }}
        onClose={() => setNarrationPreviewState(null)}
      />

      <AudioPreviewModal
        isOpen={musicPreviewState !== null}
        audioAsset={musicPreviewState?.musicAsset || null}
        title="Preview Generated Music"
        description="Review the generated background music before accepting it. This will replace the existing music."
        acceptLabel="Accept & Replace Music"
        onAccept={() => {
          if (musicPreviewState) {
            handleMusicAccept(musicPreviewState.runId, musicPreviewState.musicAssetId);
          }
        }}
        onClose={() => setMusicPreviewState(null)}
      />
    </AgentPanelProvider>
  );
};
