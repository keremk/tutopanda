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
import {
  AgentPanelProvider,
  type AgentPanelTab,
} from "@/hooks/use-agent-panel";
import type { LectureScript } from "@/prompts/create-script";

interface AgentPanelProps {
  className?: string;
  children: React.ReactNode;
}

export const AgentPanel = ({ className, children }: AgentPanelProps) => {
  const [submitStatus, setSubmitStatus] = useState<ChatStatus | undefined>();
  const [isPending, startTransition] = useTransition();
  const errorResetTimeout = useRef<number | null>(null);
  const [activeTab, setActiveTab] = useState<AgentPanelTab>("video-preview");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [scriptsByRun, setScriptsByRun] = useState<Record<string, LectureScript>>({});

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
      sendPromptAction({ prompt })
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

  const contextValue = useMemo(
    () => ({
      activeTab,
      setActiveTab,
      selectedRunId,
      setSelectedRunId,
      scriptsByRun,
      setRunScript,
    }),
    [activeTab, selectedRunId, scriptsByRun, setRunScript]
  );

  const handleRunResult = useCallback(
    (runId: string, script: LectureScript) => {
      setRunScript(runId, script);
    },
    [setRunScript]
  );

  const handleOpenScript = useCallback(
    (runId: string) => {
      setSelectedRunId(runId);
      setActiveTab("script");
    },
    [setActiveTab, setSelectedRunId]
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
          <div className="h-full flex flex-col bg-background border-l">
            {/* Header */}
            <div className="shrink-0 p-4 border-b">
              <h2 className="text-sm font-medium text-foreground">Agent Progress</h2>
            </div>

            {/* Scrollable Content Area - Takes remaining space */}
            <div className="flex-1 min-h-0">
              <AgentProgress
                onRunResult={handleRunResult}
                onViewScript={handleOpenScript}
                selectedRunId={selectedRunId}
              />
            </div>

            {/* AI Prompt Input - Fixed at Bottom */}
            <div className="shrink-0 border-t bg-background">
              <div className="p-4">
                <PromptInput
                  onSubmit={handlePromptSubmit}
                  className="w-full"
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
                      <PromptInputSubmit status={submitStatus} disabled={isPending} />
                    </PromptInputToolbar>
                  </PromptInputBody>
                </PromptInput>
              </div>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </AgentPanelProvider>
  );
};
