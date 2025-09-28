import { listProjectsWithLatestLecture } from "@/data/project";
import { CreatePageContent } from "@/components/create-page-content";
import { getSession } from "@/lib/session";

export default async function CreatePage() {
  const { user } = await getSession();
  const projects = await listProjectsWithLatestLecture(user.id);

  const sidebarProjects = projects.map(({ project, latestLectureId }) => ({
    id: project.id,
    name: project.name,
    lectureId: latestLectureId,
  }));

  return <CreatePageContent projects={sidebarProjects} />;
}
