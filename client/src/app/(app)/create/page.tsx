import { listVideoLecturesForUser } from "@/data/lecture/repository";
import { CreatePageContent } from "@/components/create-page-content";
import { getSession } from "@/lib/session";

export default async function CreatePage() {
  const { user } = await getSession();
  const lectures = await listVideoLecturesForUser(user.id);

  return <CreatePageContent lectures={lectures} />;
}
