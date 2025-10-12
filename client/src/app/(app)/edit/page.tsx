import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { getOrCreateDefaultProject } from "@/data/project";
import { getLatestVideoLectureForProject } from "@/data/lecture/repository";

export default async function EditIndexPage() {
  const { user } = await getSession();
  const project = await getOrCreateDefaultProject(user.id);
  const latestLecture = await getLatestVideoLectureForProject(project.id);

  if (latestLecture) {
    redirect(`/edit/${latestLecture.id}`);
  }

  // No lectures yet, redirect to create page
  redirect("/create");
}
