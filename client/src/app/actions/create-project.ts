"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";

import { db } from "@/db/db";
import { getOrCreateDefaultProject } from "@/data/project";
import { createVideoLecture } from "@/data/lecture/repository";
import { createWorkflowRun } from "@/data/workflow-runs";
import { getSession } from "@/lib/session";
import { getInngestApp } from "@/inngest/client";
import type { LectureCreationEventData } from "@/inngest/functions/start-lecture-creation";
import { LECTURE_WORKFLOW_TOTAL_STEPS } from "@/inngest/functions/workflow-utils";
import {
  DEFAULT_IMAGE_GENERATION_DEFAULTS,
  DEFAULT_NARRATION_GENERATION_DEFAULTS,
  DEFAULT_LECTURE_CONFIG,
} from "@/types/types";

const inngest = getInngestApp();

type CreateLectureInput = {
  prompt: string;
};

export async function createLectureAction({
  prompt,
}: CreateLectureInput) {
  const cleanedPrompt = prompt.trim();

  if (!cleanedPrompt) {
    throw new Error("Prompt cannot be empty");
  }

  const { user } = await getSession();
  const runId = randomUUID();

  const { project, lecture } = await db.transaction(async (tx) => {
    // Get or create the user's default project
    const project = await getOrCreateDefaultProject(user.id, tx);

    const lecture = await createVideoLecture({
      projectId: project.id,
    }, tx);

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
        lectureId: lecture.id,
        imageDefaults: DEFAULT_IMAGE_GENERATION_DEFAULTS,
        narrationDefaults: DEFAULT_NARRATION_GENERATION_DEFAULTS,
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
