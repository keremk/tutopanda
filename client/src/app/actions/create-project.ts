"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { db } from "@/db/db";
import { createProject } from "@/data/project";
import { createVideoLecture } from "@/data/video-lectures";
import { createWorkflowRun } from "@/data/workflow-runs";
import { getSession } from "@/lib/session";
import { getInngestApp } from "@/inngest/client";
import type { LectureCreationEventData } from "@/inngest/functions/start-lecture-creation";
import { LECTURE_WORKFLOW_TOTAL_STEPS } from "@/inngest/functions/workflow-utils";

const inngest = getInngestApp();

const MAX_PROJECT_NAME_LENGTH = 80;

const deriveProjectName = (prompt: string) => {
  const firstLine = prompt
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstLine) {
    return null;
  }

  if (firstLine.length <= MAX_PROJECT_NAME_LENGTH) {
    return firstLine;
  }

  return `${firstLine.slice(0, MAX_PROJECT_NAME_LENGTH - 3)}...`;
};

type CreateProjectWithLectureInput = {
  prompt: string;
};

export async function createProjectWithLectureAction({
  prompt,
}: CreateProjectWithLectureInput) {
  const cleanedPrompt = prompt.trim();

  if (!cleanedPrompt) {
    throw new Error("Prompt cannot be empty");
  }

  const { user } = await getSession();
  const runId = randomUUID();

  const { project, lecture } = await db.transaction(async (tx) => {
    const project = await createProject(
      {
        userId: user.id,
        name: deriveProjectName(cleanedPrompt),
      },
      tx
    );

    const lecture = await createVideoLecture({ projectId: project.id }, tx);

    await createWorkflowRun(
      {
        runId,
        lectureId: lecture.id,
        userId: user.id,
        totalSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
        status: "queued",
      },
      tx
    );

    await inngest.send({
      name: "app/start-lecture-creation",
      data: {
        prompt: cleanedPrompt,
        userId: user.id,
        runId,
      } satisfies LectureCreationEventData,
    });

    return { project, lecture };
  });

  revalidatePath("/create");
  revalidatePath("/edit");
  revalidatePath(`/edit/${lecture.id}`);

  return {
    projectId: project.id,
    lectureId: lecture.id,
    runId,
  };
}
