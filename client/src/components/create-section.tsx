"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgentPanelContext, type AgentPanelTab } from "@/hooks/use-agent-panel";
import ScriptEditor from "./script-editor";
import AssetsEditor from "./assets-editor";
import VideoPreview from "./video-preview";
import EditConfiguration from "./edit-configuration";
import { useLectureEditor } from "./lecture-editor-provider";

export default function CreateSection() {
  const { activeTab, setActiveTab, configEditState, handleConfigEditComplete } = useAgentPanelContext();
  const { content } = useLectureEditor();

  // Use config from edit state if available (user clicked Edit in agent progress)
  // Otherwise use config from content (normal configuration tab)
  const config = configEditState?.config ?? content.config;
  const runId = configEditState?.runId ?? null;
  const isEditMode = configEditState !== null;

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AgentPanelTab)}
        className="h-full flex flex-col"
      >
        <div className="shrink-0 px-6 pt-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="video-preview">Video Preview</TabsTrigger>
            <TabsTrigger value="configuration">Configuration</TabsTrigger>
            <TabsTrigger value="script">Script</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent
          value="configuration"
          className="flex-1 p-6 mt-0 overflow-hidden"
        >
          <EditConfiguration
            config={config}
            runId={runId}
            isEditMode={isEditMode}
            onConfigEditComplete={handleConfigEditComplete}
          />
        </TabsContent>

        <TabsContent
          value="video-preview"
          className="flex-1 flex flex-col p-6 mt-0"
        >
          <VideoPreview />
        </TabsContent>

        <TabsContent value="script" className="flex-1 p-6 mt-0 overflow-hidden">
          <ScriptEditor />
        </TabsContent>

        <TabsContent value="assets" className="flex-1 p-6 mt-0 overflow-hidden">
          <AssetsEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
