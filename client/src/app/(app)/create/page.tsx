import TimelineVideoApp from '@/components/timeline-video-app';
import { AgentPanel } from '@/components/agent-panel';

export default function EditPage() {
  return (
    <div className="h-full">
      <AgentPanel>
        <TimelineVideoApp />
      </AgentPanel>
    </div>
  );
}