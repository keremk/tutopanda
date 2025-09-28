import { notFound } from "next/navigation";

import CreateSection from "@/components/create-section";
import { AgentPanel } from "@/components/agent-panel";
import { AppSidebarShell } from "@/components/app-sidebar-shell";
import { listProjectsWithLatestLecture } from "@/data/project";
import { getSession } from "@/lib/session";

type EditPageParams = {
  lectureId: string;
};

export default async function EditLecturePage({
  params,
}: {
  params: Promise<EditPageParams>;
}) {
  const { user } = await getSession();
  const projects = await listProjectsWithLatestLecture(user.id);

  const { lectureId: rawLectureId } = await params;
  const lectureId = Number.parseInt(rawLectureId, 10);

  if (!Number.isFinite(lectureId)) {
    notFound();
  }

  return (
    <AppSidebarShell
      projects={projects.map(({ project, latestLectureId }) => ({
        id: project.id,
        name: project.name,
        lectureId: latestLectureId,
      }))}
      activeLectureId={lectureId}
      sidebarDefaultOpen={false}
    >
      <div className="flex h-full flex-1">
        <AgentPanel className="h-full">
          <CreateSection />
        </AgentPanel>
      </div>
    </AppSidebarShell>
  );
}
