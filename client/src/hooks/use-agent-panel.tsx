"use client";

import { createContext, useContext } from "react";

import type { LectureScript } from "@/prompts/create-script";
import type { LectureConfig } from "@/types/types";

export type AgentPanelTab = "configuration" | "video-preview" | "script" | "assets";

export type AgentPanelContextValue = {
  activeTab: AgentPanelTab;
  setActiveTab: (tab: AgentPanelTab) => void;
  selectedRunId: string | null;
  setSelectedRunId: (runId: string | null) => void;
  scriptsByRun: Record<string, LectureScript>;
  setRunScript: (runId: string, script: LectureScript) => void;
  configEditState: { runId: string; config: LectureConfig } | null;
  handleConfigEditComplete: (runId: string, config: LectureConfig) => void;
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
