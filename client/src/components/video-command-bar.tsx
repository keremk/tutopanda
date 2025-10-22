"use client";

import { useState, useTransition } from "react";
import { RefreshCw, Download } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useLectureEditor } from "./lecture-editor-provider";
import { regenerateTimelineAction } from "@/app/actions/regenerate-timeline";
import type { TimelineAssemblyStrategy } from "@/types/types";

const strategyLabels: Record<TimelineAssemblyStrategy, string> = {
  "speed-adjustment": "Speed Adjustment",
  "styled-transition": "Styled Transitions",
};

const strategyDescriptions: Record<TimelineAssemblyStrategy, string> = {
  "speed-adjustment": "Adjust video playback speed to match narration duration",
  "styled-transition": "Use fade effects and transitions for duration mismatches",
};

export default function VideoCommandBar() {
  const { timeline, updateTimeline, lectureId } = useLectureEditor();
  const [isRegenerating, startTransition] = useTransition();
  const [isPending, setIsPending] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const currentStrategy: TimelineAssemblyStrategy = timeline?.assemblyStrategy ?? "speed-adjustment";

  const handleStrategyChange = (value: string) => {
    const newStrategy = value as TimelineAssemblyStrategy;

    // Optimistically update the timeline with the new strategy
    updateTimeline((prevTimeline) => {
      if (!prevTimeline) return prevTimeline;

      return {
        ...prevTimeline,
        assemblyStrategy: newStrategy,
      };
    });
  };

  const handleRegenerate = async () => {
    try {
      setIsPending(true);
      await regenerateTimelineAction({ lectureId });
    } catch (error) {
      console.error("Failed to regenerate timeline:", error);
    } finally {
      setIsPending(false);
    }
  };

  const handleExport = async () => {
    setIsExporting(true);
    // TODO: Phase 2 - implement export
    console.log("Export video to MP4");
    setTimeout(() => setIsExporting(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border bg-card p-3 mb-4">
      <div className="flex items-center gap-3">
        <Label htmlFor="assembly-strategy" className="text-sm font-medium whitespace-nowrap">
          Assembly Strategy
        </Label>
        <Select
          value={currentStrategy}
          onValueChange={handleStrategyChange}
        >
          <SelectTrigger id="assembly-strategy" className="w-[200px]">
            <SelectValue placeholder="Select strategy" />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(strategyLabels) as TimelineAssemblyStrategy[]).map((strategy) => (
              <SelectItem key={strategy} value={strategy}>
                {strategyLabels[strategy]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Button
          onClick={handleRegenerate}
          disabled={isPending || isRegenerating}
          variant="secondary"
          size="sm"
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${(isPending || isRegenerating) ? 'animate-spin' : ''}`} />
          {isPending || isRegenerating ? "Regenerating..." : "Regenerate Timeline"}
        </Button>

        <Button
          onClick={handleExport}
          disabled={isExporting}
          variant="secondary"
          size="sm"
        >
          <Download className={`mr-2 h-4 w-4`} />
          Export
        </Button>
      </div>
    </div>
  );
}
