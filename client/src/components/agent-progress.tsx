"use client";

import { useMemo } from "react";
import { AlertTriangleIcon, BrainIcon, Loader2Icon } from "lucide-react";
import { useInngestSubscription } from "@inngest/realtime/hooks";

import {
  Task,
  TaskTrigger,
  TaskContent,
  TaskItem,
} from "@/components/ai-elements/task";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { fetchLectureProgressSubscriptionToken } from "@/app/actions/get-subscribe-token";
import type { LectureProgressMessage } from "@/inngest/functions/start-lecture-creation";

interface AgentProgressProps {
  className?: string;
}

type RunProgress = {
  runId: string;
  messages: LectureProgressMessage[];
  status: LectureProgressMessage["status"];
  lastUpdated: number;
};

export const AgentProgress = ({ className }: AgentProgressProps) => {
  const { data = [], state, error } = useInngestSubscription({
    refreshToken: fetchLectureProgressSubscriptionToken,
  });

  const runs = useMemo(() => {
    if (!data.length) {
      return [] as RunProgress[];
    }

    const grouped = new Map<string, LectureProgressMessage[]>();

    for (const message of data) {
      if (message.topic !== "progress") {
        continue;
      }

      const payload = message.data as LectureProgressMessage | undefined;

      if (!payload?.runId) {
        continue;
      }

      const existing = grouped.get(payload.runId);

      if (existing) {
        existing.push(payload);
      } else {
        grouped.set(payload.runId, [payload]);
      }
    }

    return Array.from(grouped.entries())
      .map(([runId, updates]) => {
        const sorted = [...updates].sort((a, b) => a.step - b.step);
        const last = sorted[sorted.length - 1];
        const parsedTimestamp = last ? Date.parse(last.timestamp) : Number.NaN;

        return {
          runId,
          messages: sorted,
          status: last?.status ?? "in-progress",
          lastUpdated: Number.isFinite(parsedTimestamp)
            ? parsedTimestamp
            : Date.now(),
        } satisfies RunProgress;
      })
      .sort((a, b) => b.lastUpdated - a.lastUpdated);
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
          const lastMessage = run.messages[run.messages.length - 1];
          const totalSteps = lastMessage?.totalSteps ?? run.messages.length;
          const completedSteps = Math.min(run.messages.length, totalSteps);
          const statusLabel = run.status === "complete" ? "complete" : "in progress";
          const title = `Lecture creation · ${completedSteps}/${totalSteps} steps • ${statusLabel}`;

          return (
            <Task key={run.runId} defaultOpen={run.status !== "complete"}>
              <TaskTrigger title={title} />
              <TaskContent>
                {run.messages.map((message, index) => (
                  <TaskItem
                    key={`${run.runId}-${message.step}`}
                    className={cn(
                      "flex items-start gap-3",
                      index === run.messages.length - 1 &&
                        message.status === "complete" &&
                        "text-foreground"
                    )}
                  >
                    <span className="mt-0.5 min-w-6 text-xs font-semibold text-muted-foreground">
                      {message.step}.
                    </span>
                    <span className="flex-1">{message.message}</span>
                  </TaskItem>
                ))}
              </TaskContent>
            </Task>
          );
        })}
      </div>
    </ScrollArea>
  );
};
