import { listProjectsForUser } from "@/data/project";
import { CreatePageContent } from "@/components/create-page-content";
import { getSession } from "@/lib/session";

export default async function CreatePage() {
  const { user } = await getSession();
  const projects = await listProjectsForUser(user.id);

  return <CreatePageContent projects={projects} />;
}
