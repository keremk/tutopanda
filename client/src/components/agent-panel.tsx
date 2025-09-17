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
import { type FormEvent } from "react";

interface AgentPanelProps {
  className?: string;
  children: React.ReactNode;
}

export const AgentPanel = ({ className, children }: AgentPanelProps) => {
  const handlePromptSubmit = (message: PromptInputMessage, event: FormEvent<HTMLFormElement>) => {
    // TODO: Implement backend integration
    console.log("Prompt submitted:", message);
  };

  return (
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
            <AgentProgress />
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
                    <PromptInputSubmit />
                  </PromptInputToolbar>
                </PromptInputBody>
              </PromptInput>
            </div>
          </div>
        </div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};