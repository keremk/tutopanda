"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  AlertTriangleIcon,
  BrainIcon,
  ChevronDownIcon,
  Loader2Icon,
  NotebookPenIcon,
} from "lucide-react";
import { useInngestSubscription } from "@inngest/realtime/hooks";

import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskItem,
} from "@/components/ai-elements/task";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fetchLectureProgressSubscriptionToken } from "@/app/actions/get-subscribe-token";
import type {
  LectureProgressMessage,
  LectureReasoningMessage,
  LectureResultMessage,
  LectureRunStatus,
  LectureStatusMessage,
} from "@/inngest/functions/start-lecture-creation";
import type { LectureScript } from "@/inngest/functions/start-lecture-creation";

interface AgentProgressProps {
  className?: string;
  onRunResult?: (runId: string, script: LectureScript) => void;
  onViewScript?: (runId: string) => void;
  selectedRunId?: string | null;
}

type RunProgress = {
  runId: string;
  status: LectureRunStatus;
  steps: LectureStatusMessage[];
  reasoning?: LectureReasoningMessage;
  result?: LectureResultMessage;
  lastUpdated: number;
  totalSteps: number;
};

const getTimestamp = (value?: string) => {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
};

export const AgentProgress = ({
  className,
  onRunResult,
  onViewScript,
  selectedRunId,
}: AgentProgressProps) => {
  const { data = [], state, error } = useInngestSubscription({
    refreshToken: fetchLectureProgressSubscriptionToken,
  });

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

    for (const message of data) {
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
        steps: [] as LectureStatusMessage[],
        lastUpdated: 0,
        totalSteps: 0,
      };

      switch (payload.type) {
        case "status": {
          console.log("Received lecture status", payload.runId, payload.step, payload.status);
          const existingIndex = current.steps.findIndex((step) => step.step === payload.step);

          if (existingIndex >= 0) {
            current.steps[existingIndex] = payload;
          } else {
            current.steps.push(payload);
          }

          current.steps.sort((a, b) => a.step - b.step);
          current.status = payload.status;
          current.totalSteps = Math.max(current.totalSteps, payload.totalSteps);
          current.lastUpdated = Math.max(current.lastUpdated, getTimestamp(payload.timestamp));
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
        default:
          break;
      }

      grouped.set(payload.runId, current);
    }

    return Array.from(grouped.values()).sort((a, b) => b.lastUpdated - a.lastUpdated);
  }, [data]);

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
    if (state === "connecting" || state === "refresh_token") {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
          <Loader2Icon className="size-10 animate-spin text-muted-foreground" />
          <div>
            <h3 className="text-lg font-medium text-foreground">Connecting</h3>
            <p className="text-sm text-muted-foreground">
              Listening for realtime agent updates…
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
          const completedSteps = run.steps.length;
          const statusLabel =
            run.status === "complete"
              ? "complete"
              : run.status === "error"
              ? "error"
              : "in progress";
          const title = `Lecture creation · ${completedSteps}/${totalSteps} steps • ${statusLabel}`;
          const isSelected = selectedRunId === run.runId;

          return (
            <Task
              key={run.runId}
              defaultOpen={run.status !== "complete"}
              className={cn(
                "rounded-lg border border-border/60 bg-card/50 p-3",
                isSelected && "border-primary bg-primary/5"
              )}
            >
              <TaskTrigger
                title={title}
                className={cn("group", isSelected && "text-primary")}
              >
                <div className="flex w-full items-center justify-between gap-2 text-sm text-muted-foreground transition-colors group-hover:text-foreground">
                  <div className="flex items-center gap-2">
                    <NotebookPenIcon className="size-4" />
                    <span>{title}</span>
                  </div>
                  <ChevronDownIcon className="size-4 transition-transform group-data-[state=open]:rotate-180" />
                </div>
              </TaskTrigger>
              <TaskContent>
                {run.steps.map((message) => (
                  <TaskItem
                    key={`${run.runId}-${message.step}`}
                    className={cn(
                      "flex items-start gap-3",
                      message.status === "complete" && "text-foreground",
                      message.status === "error" && "text-destructive"
                    )}
                  >
                    <span className="mt-0.5 min-w-6 text-xs font-semibold text-muted-foreground">
                      {message.step}.
                    </span>
                    <span className="flex-1">{message.message}</span>
                  </TaskItem>
                ))}

                {run.reasoning ? (
                  <TaskItem className="flex items-start gap-3 whitespace-pre-wrap">
                    <span className="mt-0.5 min-w-6 text-xs font-semibold text-muted-foreground">
                      AI
                    </span>
                    <span className="flex-1 text-xs leading-relaxed text-muted-foreground">
                      {run.reasoning.text}
                    </span>
                  </TaskItem>
                ) : null}

                {run.result ? (
                  <TaskItem className="flex items-center justify-between gap-3 text-foreground">
                    <div>
                      <p className="text-sm font-medium">Script drafted</p>
                      <p className="text-xs text-muted-foreground">
                        Open the Script tab to review the generated JSON.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant={isSelected ? "default" : "outline"}
                      onClick={() => onViewScript?.(run.runId)}
                    >
                      View script
                    </Button>
                  </TaskItem>
                ) : null}
              </TaskContent>
            </Task>
          );
        })}
      </div>
    </ScrollArea>
  );
};
