"use client";

import { createContext, useContext } from "react";

import type { LectureScript } from "@/inngest/functions/start-lecture-creation";

export type AgentPanelTab = "video-preview" | "script" | "assets";

export type AgentPanelContextValue = {
  activeTab: AgentPanelTab;
  setActiveTab: (tab: AgentPanelTab) => void;
  selectedRunId: string | null;
  setSelectedRunId: (runId: string | null) => void;
  scriptsByRun: Record<string, LectureScript>;
  setRunScript: (runId: string, script: LectureScript) => void;
};

const AgentPanelContext = createContext<AgentPanelContextValue | undefined>(undefined);

export const AgentPanelProvider = AgentPanelContext.Provider;

export function useAgentPanelContext() {
  const context = useContext(AgentPanelContext);

  if (!context) {
    throw new Error("useAgentPanelContext must be used within an AgentPanelProvider");
  }

  return context;
}
