"use client";

import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";
import { AgentProgress } from "@/components/agent-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  useCallback,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AgentPanelProvider,
  type AgentPanelTab,
  type TimelineSelection,
  type TimelineTrackType,
} from "@/hooks/use-agent-panel";
import type { LectureScript } from "@/prompts/create-script";
import { PanelLeftOpen, PanelRightOpen } from "lucide-react";
import type { ImperativePanelHandle } from "react-resizable-panels";

interface AgentPanelProps {
  lectureId: number;
  className?: string;
  children: React.ReactNode;
}

export const AgentPanel = ({ lectureId, className, children }: AgentPanelProps) => {
  const [activeTab, setActiveTab] = useState<AgentPanelTab>("video-preview");
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [scriptsByRun, setScriptsByRun] = useState<Record<string, LectureScript>>({});
  const [timelineSelection, setTimelineSelection] = useState<TimelineSelection | null>(null);
  const progressPanelRef = useRef<ImperativePanelHandle | null>(null);
  const [isProgressPanelCollapsed, setIsProgressPanelCollapsed] = useState(false);
  const [lastExpandedSize, setLastExpandedSize] = useState<number | null>(null);

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

  const toggleProgressPanel = useCallback(() => {
    const panel = progressPanelRef.current;
    if (!panel) {
      return;
    }

    if (panel.isCollapsed()) {
      const targetSize = lastExpandedSize ?? 30;
      panel.expand(targetSize);
    } else {
      setLastExpandedSize(panel.getSize());
      panel.collapse();
    }
  }, [lastExpandedSize]);

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

        <ResizablePanel
          ref={progressPanelRef}
          defaultSize={30}
          minSize={25}
          maxSize={45}
          collapsible
          collapsedSize={4}
          onCollapse={() => setIsProgressPanelCollapsed(true)}
          onExpand={() => setIsProgressPanelCollapsed(false)}
          onResize={(size) => {
            if (!isProgressPanelCollapsed) {
              setLastExpandedSize(size);
            }
          }}
        >
          <div
            className={cn(
              "h-full flex flex-col bg-[color:var(--surface-elevated)] border-l border-[color:var(--surface-border)] transition-colors"
            )}
          >
            {/* Header */}
            <div
              className={cn(
                "shrink-0 border-b border-[color:var(--surface-border)] flex items-center gap-2 transition-[padding] duration-200",
                isProgressPanelCollapsed ? "p-3 justify-end" : "p-4 justify-between"
              )}
            >
              {!isProgressPanelCollapsed && (
                <h2 className="text-sm font-medium text-foreground">Agent Progress</h2>
              )}
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={toggleProgressPanel}
                className="text-muted-foreground hover:text-foreground"
                aria-label={isProgressPanelCollapsed ? "Expand agent progress" : "Collapse agent progress"}
              >
                {isProgressPanelCollapsed ? (
                  <PanelRightOpen className="size-4" />
                ) : (
                  <PanelLeftOpen className="size-4" />
                )}
              </Button>
            </div>

            {/* Scrollable Content Area - Takes remaining space */}
            <div
              className={cn(
                "flex-1 min-h-0 overflow-hidden transition-all duration-200 ease-in-out",
                isProgressPanelCollapsed ? "pointer-events-none opacity-0" : "opacity-100"
              )}
            >
              <AgentProgress
                lectureId={lectureId}
                onRunResult={handleRunResult}
                onViewScript={handleOpenScript}
                selectedRunId={selectedRunId}
              />
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </AgentPanelProvider>
  );
};
