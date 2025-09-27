import CreateSection from "@/components/create-section";
import { AgentPanel } from "@/components/agent-panel";
import { AppSidebarShell } from "@/components/app-sidebar-shell";
import { listProjectsForUser } from "@/data/project";
import { getSession } from "@/lib/session";

export default async function EditPage() {
  const { user } = await getSession();
  const projects = await listProjectsForUser(user.id);

  return (
    <AppSidebarShell projects={projects} sidebarDefaultOpen={false}>
      <div className="flex h-full flex-1">
        <AgentPanel className="h-full">
          <CreateSection />
        </AgentPanel>
      </div>
    </AppSidebarShell>
  );
}
