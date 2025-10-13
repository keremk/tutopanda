"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangleIcon,
  BrainIcon,
  ChevronDownIcon,
  ImageIcon,
  Loader2Icon,
  MicIcon,
  NotebookPenIcon,
  XIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useInngestSubscription } from "@inngest/realtime/hooks";
import { cancelWorkflowAction, rerunWorkflowAction } from "@/app/actions/workflow-controls";
import { getWorkflowHistoryAction } from "@/app/actions/get-workflow-history";

import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskItem,
} from "@/components/ai-elements/task";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { fetchLectureProgressSubscriptionToken } from "@/app/actions/get-subscribe-token";
import type {
  LectureProgressMessage,
  LectureReasoningMessage,
  LectureResultMessage,
  LectureRunStatus,
  LectureStatusMessage,
  LectureConfigMessage,
  LectureImagePreviewMessage,
  LectureNarrationPreviewMessage,
  LectureMusicPreviewMessage,
} from "@/inngest/functions/workflow-utils";
import type { LectureScript } from "@/prompts/create-script";
import type { LectureConfig } from "@/types/types";

interface AgentProgressProps {
  lectureId: number;
  className?: string;
  onRunResult?: (runId: string, script: LectureScript) => void;
  onViewScript?: (runId: string) => void;
  onConfigAccepted?: (runId: string, config: LectureConfig) => void;
  onConfigEdit?: (runId: string, config: LectureConfig) => void;
  selectedRunId?: string | null;
  debugTaskCount?: number;
}

type StepProgress = {
  step: number;
  status: LectureRunStatus;
  messages: LectureStatusMessage[];
  lastUpdated: number;
};

type RunProgress = {
  runId: string;
  status: LectureRunStatus;
  steps: StepProgress[];
  reasoning?: LectureReasoningMessage;
  result?: LectureResultMessage;
  config?: LectureConfigMessage;
  imagePreview?: LectureImagePreviewMessage;
  narrationPreview?: LectureNarrationPreviewMessage;
  musicPreview?: LectureMusicPreviewMessage;
  lastUpdated: number;
  totalSteps: number;
};

const getTimestamp = (value?: string) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
};

const REASONING_MESSAGES = [
  "🤔 Pondering your request...",
  "💡 Connecting the dots...",
  "🧠 Deep in thought...",
  "✨ Crafting something special...",
  "🎯 Focusing on the details...",
];

const isAnalyzingMessage = (message: LectureStatusMessage) => {
  const analyzingPatterns = [
    /analyzing/i,
    /pondering/i,
    /thinking/i,
    /drafting/i,
  ];
  return analyzingPatterns.some((pattern) => pattern.test(message.message));
};

const isImageProgressMessage = (message: LectureStatusMessage) => {
  return /created prompt|generated image/i.test(message.message);
};

const isNarrationProgressMessage = (message: LectureStatusMessage) => {
  return /generated narration/i.test(message.message);
};

export const AgentProgress = ({
  lectureId,
  className,
  onRunResult,
  onViewScript,
  onConfigAccepted,
  onConfigEdit,
  selectedRunId,
  debugTaskCount = 0,
}: AgentProgressProps) => {
  const { data = [], state, error } = useInngestSubscription({
    refreshToken: fetchLectureProgressSubscriptionToken,
  });

  const [initialData, setInitialData] = useState<any[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [cancelingRun, setCancelingRun] = useState<string | null>(null);
  const [rerunningRun, setRerunningRun] = useState<string | null>(null);
  const [expandedRuns, setExpandedRuns] = useState<Set<string>>(new Set());
  const [rotatingMessageIndex, setRotatingMessageIndex] = useState(0);
  const [finalizedReasoningMessages, setFinalizedReasoningMessages] = useState<Map<string, string>>(new Map());

  // Load historical workflow data on mount
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const history = await getWorkflowHistoryAction(lectureId);
        setInitialData(history);
      } catch (error) {
        console.error("Failed to load workflow history:", error);
      } finally {
        setIsLoadingHistory(false);
      }
    };

    loadHistory();
  }, [lectureId]);

  const handleCancel = async (runId: string) => {
    try {
      setCancelingRun(runId);
      await cancelWorkflowAction(runId);
    } catch (error) {
      console.error("Failed to cancel workflow:", error);
    } finally {
      setCancelingRun(null);
    }
  };

  const handleRerun = async (runId: string, forceAll: boolean = false) => {
    try {
      setRerunningRun(runId);
      await rerunWorkflowAction(runId, {
        resumeFromFailure: !forceAll,
        forceAll
      });
    } catch (error) {
      console.error("Failed to rerun workflow:", error);
    } finally {
      setRerunningRun(null);
    }
  };

  const toggleRunExpanded = (runId: string) => {
    setExpandedRuns((prev) => {
      const newExpanded = new Set(prev);
      if (newExpanded.has(runId)) {
        newExpanded.delete(runId);
      } else {
        newExpanded.add(runId);
      }
      return newExpanded;
    });
  };

  // Generate debug data for testing scroll behavior
  const debugData = useMemo(() => {
    if (debugTaskCount === 0) return [];

    const messages: any[] = [];
    for (let i = 0; i < debugTaskCount; i++) {
      const runId = `debug-run-${i}`;
      const timestamp = new Date(Date.now() - i * 60000).toISOString();

      // Add status messages for each step
      for (let step = 1; step <= 7; step++) {
        messages.push({
          topic: "progress",
          data: {
            type: "status",
            runId,
            step,
            totalSteps: 7,
            status: step < 3 ? "complete" : step === 3 ? "in-progress" : "pending",
            message: `Processing step ${step}`,
            timestamp,
          },
        });
      }
    }
    return messages;
  }, [debugTaskCount]);

  const deliveredResults = useRef(new Set<string>());

  useEffect(() => {
    if (!onRunResult) {
      return;
    }

    for (const message of data) {
      if (message.topic !== "progress") {
        continue;
      }

      const payload = message.data as LectureProgressMessage | undefined;

      if (payload?.type !== "result") {
        continue;
      }

      console.log("Received lecture result", payload.runId, payload.timestamp);

      if (deliveredResults.current.has(payload.runId)) {
        continue;
      }

      deliveredResults.current.add(payload.runId);
      onRunResult(payload.runId, payload.script);
    }
  }, [data, onRunResult]);

  const runs = useMemo(() => {
    const grouped = new Map<string, RunProgress>();

    // Merge initial (historical), real-time, and debug data
    // Real-time data takes precedence over historical data for the same runId
    const runIdsWithRealTimeData = new Set(data.map(msg => (msg.data as any)?.runId).filter(Boolean));
    const historicalDataToUse = initialData.filter(
      msg => !runIdsWithRealTimeData.has((msg.data as any)?.runId)
    );
    const allData = [...historicalDataToUse, ...data, ...debugData];

    for (const message of allData) {
      if (message.topic !== "progress") {
        continue;
      }

      const payload = message.data as LectureProgressMessage | undefined;

      if (!payload) {
        continue;
      }

      const current = grouped.get(payload.runId) ?? {
        runId: payload.runId,
        status: "in-progress" as LectureRunStatus,
        steps: [] as StepProgress[],
        lastUpdated: 0,
        totalSteps: 0,
      };

      switch (payload.type) {
        case "status": {
          console.log(
            "Received lecture status",
            payload.runId,
            payload.step,
            payload.status
          );
          const timestamp = getTimestamp(payload.timestamp);
          const existing = current.steps.find((step) => step.step === payload.step);

          if (existing) {
            existing.messages = [...existing.messages, payload].sort(
              (a, b) => getTimestamp(a.timestamp) - getTimestamp(b.timestamp)
            );
            existing.status = payload.status;
            existing.lastUpdated = Math.max(existing.lastUpdated, timestamp);
          } else {
            current.steps.push({
              step: payload.step,
              status: payload.status,
              messages: [payload],
              lastUpdated: timestamp,
            });
          }

          current.steps.sort((a, b) => a.step - b.step);
          current.status = payload.status;
          current.totalSteps = Math.max(current.totalSteps, payload.totalSteps);
          current.lastUpdated = Math.max(current.lastUpdated, timestamp);
          break;
        }
        case "reasoning": {
          console.log("Received lecture reasoning", payload.runId, payload.isFinal);
          current.reasoning = payload;
          current.lastUpdated = Math.max(current.lastUpdated, getTimestamp(payload.timestamp));
          break;
        }
        case "result": {
          current.result = payload;
          current.status = "complete";
          current.lastUpdated = Math.max(current.lastUpdated, getTimestamp(payload.timestamp));
          break;
        }
        case "config": {
          current.config = payload;
          current.lastUpdated = Math.max(current.lastUpdated, getTimestamp(payload.timestamp));
          break;
        }
        case "image-preview": {
          current.imagePreview = payload;
          current.lastUpdated = Math.max(current.lastUpdated, getTimestamp(payload.timestamp));
          break;
        }
        case "narration-preview": {
          current.narrationPreview = payload;
          current.lastUpdated = Math.max(current.lastUpdated, getTimestamp(payload.timestamp));
          break;
        }
        case "music-preview": {
          current.musicPreview = payload;
          current.lastUpdated = Math.max(current.lastUpdated, getTimestamp(payload.timestamp));
          break;
        }
        case "image-complete":
        case "narration-complete":
        case "music-complete": {
          // These are completion events, no need to store them in state
          // They trigger UI refresh through revalidation
          break;
        }
        default:
          break;
      }

      grouped.set(payload.runId, current);
    }

    return Array.from(grouped.values()).sort((a, b) => a.lastUpdated - b.lastUpdated);
  }, [data, debugData, initialData]);

  // Auto-expand in-progress runs
  useEffect(() => {
    setExpandedRuns((prev) => {
      const newExpanded = new Set(prev);
      for (const run of runs) {
        if (run.status === "in-progress" && !newExpanded.has(run.runId)) {
          newExpanded.add(run.runId);
        }
      }
      return newExpanded;
    });
  }, [runs]);

  // Store the final rotating message when reasoning finalizes
  useEffect(() => {
    for (const run of runs) {
      if (run.reasoning?.isFinal && !finalizedReasoningMessages.has(run.runId)) {
        setFinalizedReasoningMessages(prev => {
          const next = new Map(prev);
          next.set(run.runId, REASONING_MESSAGES[rotatingMessageIndex]);
          return next;
        });
      }
    }
  }, [runs, rotatingMessageIndex, finalizedReasoningMessages]);

  // Rotate reasoning messages for active reasoning runs
  useEffect(() => {
    const hasActiveReasoning = runs.some(
      (run) => run.status === "in-progress" && run.reasoning && !run.reasoning.isFinal
    );

    if (!hasActiveReasoning) {
      return;
    }

    const interval = setInterval(() => {
      setRotatingMessageIndex((prev) => (prev + 1) % REASONING_MESSAGES.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [runs]);

  const hasRuns = runs.length > 0;

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
        <AlertTriangleIcon className="mb-2 size-12 text-destructive" />
        <h3 className="text-lg font-medium text-foreground">Connection lost</h3>
        <p className="text-sm text-muted-foreground">
          {error.message || "Unable to receive agent updates right now."}
        </p>
      </div>
    );
  }

  if (!hasRuns) {
    if (isLoadingHistory || state === "connecting" || state === "refresh_token") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <Loader2Icon className="size-10 animate-spin text-muted-foreground" />
          <div>
            <h3 className="text-lg font-medium text-foreground">
              {isLoadingHistory ? "Loading workflow history" : "Connecting"}
            </h3>
            <p className="text-sm text-muted-foreground">
              {isLoadingHistory ? "Fetching previous runs…" : "Listening for realtime agent updates…"}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
        <BrainIcon className="size-10 text-muted-foreground" />
        <div>
          <h3 className="text-lg font-medium text-foreground">No active tasks</h3>
          <p className="text-sm text-muted-foreground">
            Submit a prompt to see the agent’s progress appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className={cn("h-full", className)}>
      <div className="space-y-4 p-4">
        {runs.map((run) => {
          const totalSteps = run.totalSteps || run.steps.length || 1;
          const completedSteps = run.steps.filter((step) => step.status === "complete").length;
          const statusLabel =
            run.status === "complete"
              ? "complete"
              : run.status === "error"
              ? "error"
              : "in progress";
          const descriptor = `Lecture creation · ${completedSteps}/${totalSteps} steps • ${statusLabel}`;
          const isSelected = selectedRunId === run.runId;
          const isExpanded = expandedRuns.has(run.runId);

          return (
            <Collapsible
              key={run.runId}
              open={isExpanded}
              onOpenChange={() => toggleRunExpanded(run.runId)}
            >
              <div
                className={cn(
                  "rounded-lg border border-border/60 bg-card/50 p-3",
                  isSelected && "border-primary bg-primary/5"
                )}
              >
                <CollapsibleTrigger asChild>
                  <div className="flex cursor-pointer items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <NotebookPenIcon className="size-4" />
                      <span>{descriptor}</span>
                      <ChevronDownIcon
                        className={cn(
                          "size-4 transition-transform",
                          isExpanded && "rotate-180"
                        )}
                      />
                    </div>
                    <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                      {run.status === "in-progress" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCancel(run.runId)}
                          disabled={cancelingRun === run.runId}
                        >
                          {cancelingRun === run.runId ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <XIcon className="size-4" />
                          )}
                          <span className="ml-1">Cancel</span>
                        </Button>
                      )}
                      {(run.status === "error" || run.status === "complete") && run.totalSteps > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRerun(run.runId, false)}
                          disabled={rerunningRun === run.runId}
                        >
                          {rerunningRun === run.runId ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <RotateCcwIcon className="size-4" />
                          )}
                          <span className="ml-1">Rerun</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </CollapsibleTrigger>

                <CollapsibleContent>
                  {run.config ? (
                <div className="mt-3 rounded-md border border-border/60 bg-card/30 p-3">
                  <h4 className="mb-2 text-sm font-medium text-foreground">Configuration Summary</h4>
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div><strong>Duration:</strong> {run.config.config.general.duration}</div>
                    <div><strong>Language:</strong> {run.config.config.general.language}{run.config.config.general.subtitleLanguage ? ` (Subtitles: ${run.config.config.general.subtitleLanguage})` : ""}</div>
                    <div><strong>Size & Aspect Ratio:</strong> {run.config.config.image.size} • {run.config.config.image.aspectRatio}</div>
                    <div><strong>Style:</strong> {run.config.config.image.style}</div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => onConfigAccepted?.(run.runId, run.config!.config)}
                    >
                      Accept and Continue
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onConfigEdit?.(run.runId, run.config!.config)}
                    >
                      Edit
                    </Button>
                  </div>
                </div>
              ) : null}

                  {run.imagePreview ? (
                <div className="mt-3 rounded-md border border-border/60 bg-card/30 p-3">
                  <h4 className="mb-2 text-sm font-medium text-foreground">Image Generated</h4>
                  <p className="text-sm text-muted-foreground">
                    A new image is ready. Review it from the Visuals editor to accept or reject this update.
                  </p>
                </div>
              ) : null}

                  {run.narrationPreview ? (
                <div className="mt-3 rounded-md border border-border/60 bg-card/30 p-3">
                  <h4 className="mb-2 text-sm font-medium text-foreground">Narration Generated</h4>
                  <p className="text-sm text-muted-foreground">
                    A new narration is ready. Review it from the Narration editor to accept or reject this update.
                  </p>
                </div>
              ) : null}

                  {run.musicPreview ? (
                <div className="mt-3 rounded-md border border-border/60 bg-card/30 p-3">
                  <h4 className="mb-2 text-sm font-medium text-foreground">Music Generated</h4>
                  <p className="text-sm text-muted-foreground">
                    A new music track is ready. Review it from the Background Score editor to accept or reject this update.
                  </p>
                </div>
              ) : null}

              <div className="mt-3 space-y-3">
                {run.steps.map((step) => {
                  const latestMessage = step.messages[step.messages.length - 1];
                  const stepStatusLabel =
                    step.status === "complete"
                      ? "complete"
                      : step.status === "error"
                      ? "error"
                      : "in progress";
                  const stepTitle = `Step ${step.step}/${totalSteps} · ${
                    latestMessage?.message ?? "Pending"
                  } • ${stepStatusLabel}`;
                  const showReasoning = Boolean(run.reasoning) && step.step === 1;
                  const showResult = Boolean(run.result) && step.step === totalSteps;

                  return (
                    <Task
                      key={`${run.runId}-${step.step}`}
                      defaultOpen={step.status !== "complete"}
                      className="rounded-md border border-border/60 bg-card/30 p-2"
                    >
                      <TaskTrigger title={stepTitle} className="group">
                        <div className="flex w-full items-center justify-between gap-2 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                          <div className="flex items-center gap-2">
                            <NotebookPenIcon className="size-4" />
                            <span>{stepTitle}</span>
                          </div>
                          <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                        </div>
                      </TaskTrigger>
                      <TaskContent>
                        {step.step === 1 && run.reasoning && !run.reasoning.isFinal ? (
                          <TaskItem className="flex items-start gap-3">
                            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
                            <span className="flex-1">{REASONING_MESSAGES[rotatingMessageIndex]}</span>
                          </TaskItem>
                        ) : step.step === 1 && run.reasoning?.isFinal && finalizedReasoningMessages.has(run.runId) ? (
                          <TaskItem className="flex items-start gap-3">
                            <span className="flex-1">{finalizedReasoningMessages.get(run.runId)}</span>
                          </TaskItem>
                        ) : null}

                        {(() => {
                          // Filter messages based on type
                          const isImageStep = step.step === 3;
                          const isNarrationStep = step.step === 5;

                          const progressMessages = step.messages.filter((msg) => {
                            if (isImageStep) return isImageProgressMessage(msg);
                            if (isNarrationStep) return isNarrationProgressMessage(msg);
                            return false;
                          });

                          const regularMessages = step.messages.filter(
                            (msg) => !isAnalyzingMessage(msg) &&
                              !isImageProgressMessage(msg) &&
                              !isNarrationProgressMessage(msg)
                          );

                          return (
                            <>
                              {regularMessages.map((message, index) => {
                                const markerClass =
                                  message.status === "complete"
                                    ? "bg-primary"
                                    : message.status === "error"
                                    ? "bg-destructive"
                                    : "bg-muted-foreground";

                                return (
                                  <TaskItem
                                    key={`${run.runId}-${step.step}-${message.timestamp}-${index}`}
                                    className={cn(
                                      "flex items-start gap-3",
                                      message.status === "complete" && "text-foreground",
                                      message.status === "error" && "text-destructive"
                                    )}
                                  >
                                    <span
                                      className={cn(
                                        "mt-1.5 block size-1.5 rounded-full",
                                        markerClass
                                      )}
                                    />
                                    <span className="flex-1">{message.message}</span>
                                  </TaskItem>
                                );
                              })}

                              {progressMessages.length > 0 ? (
                                <div className="mt-3 rounded-md border border-border/60 bg-muted/40 p-3">
                                  <div className="mb-2 flex items-center gap-2">
                                    {isImageStep ? (
                                      <ImageIcon className="size-4 text-muted-foreground" />
                                    ) : (
                                      <MicIcon className="size-4 text-muted-foreground" />
                                    )}
                                    <h4 className="text-sm font-medium text-foreground">
                                      {isImageStep ? "Image Generation Progress" : "Narration Generation Progress"}
                                    </h4>
                                  </div>
                                  <div
                                    ref={(node) => {
                                      if (node) {
                                        node.scrollTop = node.scrollHeight;
                                      }
                                    }}
                                    className="max-h-[200px] overflow-y-auto rounded border border-border/40 bg-card/50 p-3"
                                  >
                                    <div className="space-y-1 text-xs text-muted-foreground">
                                      {progressMessages.map((msg, index) => (
                                        <div key={`${run.runId}-${step.step}-progress-${index}`}>
                                          {msg.message}
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </>
                          );
                        })()}

                        {showReasoning && run.reasoning?.text ? (
                          <div className="mt-3 rounded-md border border-border/60 bg-muted/40 p-3">
                            <div className="mb-2 flex items-center gap-2">
                              <BrainIcon className="size-4 text-muted-foreground" />
                              <h4 className="text-sm font-medium text-foreground">AI Reasoning Process</h4>
                            </div>
                            <div
                              ref={(node) => {
                                if (node) {
                                  node.scrollTop = node.scrollHeight;
                                }
                              }}
                              className="max-h-[200px] overflow-y-auto rounded border border-border/40 bg-card/50 p-3"
                            >
                              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                                {run.reasoning.text}
                              </p>
                            </div>
                          </div>
                        ) : null}

                      </TaskContent>
                    </Task>
                  );
                })}
              </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          );
        })}
      </div>
    </ScrollArea>
  );
};
