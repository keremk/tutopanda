"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getLectureById } from "@/data/lecture/repository";
import { getInngestApp } from "@/inngest/client";
import type { GenerateTimelineEvent } from "@/inngest/functions/generate-timeline";

const inngest = getInngestApp();

type RegenerateTimelineInput = {
  lectureId: number;
};

export async function regenerateTimelineAction({
  lectureId,
}: RegenerateTimelineInput) {
  const { user } = await getSession();

  // Fetch lecture to validate access
  const lecture = await getLectureById({ lectureId });

  if (!lecture) {
    throw new Error("Lecture not found");
  }

  // Note: lecture ownership is already validated when fetching
  // getLectureById already ensures the lecture belongs to the user

  // Generate new run ID for the workflow
  const runId = randomUUID();

  // Send event to Inngest to regenerate timeline
  await inngest.send({
    name: "app/generate-timeline",
    data: {
      userId: user.id,
      runId,
      lectureId,
      projectId: lecture.projectId,
      // Single step workflow for timeline regeneration
      workflowStep: 7,
      totalWorkflowSteps: 7,
    } satisfies GenerateTimelineEvent,
  });

  return { runId, success: true };
}
