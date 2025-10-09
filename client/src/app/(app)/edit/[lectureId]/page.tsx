import { notFound } from "next/navigation";

import EditorTabs from "@/components/editor-tabs";
import { AgentPanel } from "@/components/agent-panel";
import { AppSidebarShell } from "@/components/app-sidebar-shell";
import { LectureEditorProvider } from "@/components/lecture-editor-provider";
import { getLectureForUser, listVideoLecturesForUser, toSerializableLectureSnapshot } from "@/data/lecture/repository";
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
  const lectures = await listVideoLecturesForUser(user.id);

  const { lectureId: rawLectureId } = await params;
  const lectureId = Number.parseInt(rawLectureId, 10);

  if (!Number.isFinite(lectureId)) {
    notFound();
  }

  const lecture = await getLectureForUser({
    lectureId,
    userId: user.id,
  });

  if (!lecture) {
    notFound();
  }

  const serialisedLecture = toSerializableLectureSnapshot(lecture);

  return (
    <AppSidebarShell
      lectures={lectures}
      activeLectureId={lectureId}
      sidebarDefaultOpen={false}
    >
      <LectureEditorProvider
        lectureId={lectureId}
        initialSnapshot={serialisedLecture}
      >
        <div className="flex h-full">
          <AgentPanel lectureId={lectureId}>
            <EditorTabs />
          </AgentPanel>
        </div>
      </LectureEditorProvider>
    </AppSidebarShell>
  );
}
