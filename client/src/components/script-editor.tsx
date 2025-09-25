"use client";

import { ScrollArea } from "@/components/ui/scroll-area";
import { useAgentPanelContext } from "@/hooks/use-agent-panel";

export default function ScriptEditor() {
  const { selectedRunId, scriptsByRun } = useAgentPanelContext();
  const script = selectedRunId ? scriptsByRun[selectedRunId] : undefined;

  if (!script) {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-6 text-center">
        <h3 className="text-base font-semibold text-foreground">No script selected</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete a lecture creation run and choose “View script” from the agent panel to load it here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <div>
        <h3 className="text-base font-semibold text-foreground">Generated script</h3>
        <p className="text-xs text-muted-foreground">Run ID: {selectedRunId}</p>
      </div>
      <div className="flex-1 overflow-hidden rounded-lg border bg-muted/30">
        <ScrollArea className="h-full w-full">
          <pre className="w-full whitespace-pre-wrap break-words p-4 font-mono text-sm leading-relaxed text-foreground/90">
            {JSON.stringify(script, null, 2)}
          </pre>
        </ScrollArea>
      </div>
    </div>
  );
}
