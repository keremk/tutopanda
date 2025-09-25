"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAgentPanelContext, type AgentPanelTab } from "@/hooks/use-agent-panel";
import ScriptEditor from "./script-editor";
import AssetsEditor from "./assets-editor";
import VideoPreview from "./video-preview";

export default function CreateSection() {
  const { activeTab, setActiveTab } = useAgentPanelContext();

  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <Tabs
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as AgentPanelTab)}
        className="h-full flex flex-col"
      >
        <div className="shrink-0 px-6 pt-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="video-preview">Video Preview</TabsTrigger>
            <TabsTrigger value="script">Script</TabsTrigger>
            <TabsTrigger value="assets">Assets</TabsTrigger>
          </TabsList>
        </div>

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
