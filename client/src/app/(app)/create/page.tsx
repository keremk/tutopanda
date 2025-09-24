import CreateSection from "@/components/create-section";
import { AgentPanel } from "@/components/agent-panel";

export default function EditPage() {
  return (
    <div className="h-full">
      <AgentPanel>
        <CreateSection />
      </AgentPanel>
    </div>
  );
}
