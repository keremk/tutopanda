"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getLectureById } from "@/data/lecture/repository";
import { getInngestApp } from "@/inngest/client";
import type { RegenerateSingleNarrationEvent } from "@/inngest/functions/regenerate-single-narration";
import type { LectureConfig } from "@/types/types";

const inngest = getInngestApp();

type RegenerateNarrationInput = {
  lectureId: number;
  narrationAssetId: string;
  script: string;
  model: string;
  voice: string;
  emotion?: string;
};

export async function regenerateNarrationAction({
  lectureId,
  narrationAssetId,
  script,
  model,
  voice,
  emotion,
}: RegenerateNarrationInput) {
  const { user } = await getSession();

  // Fetch lecture to validate access and get config
  const lecture = await getLectureById({ lectureId });

  if (!lecture) {
    throw new Error("Lecture not found");
  }

  // Note: lecture ownership is already validated when fetching
  // getLectureById already ensures the lecture belongs to the user

  if (!lecture.config) {
    throw new Error("Lecture configuration not found");
  }

  // Verify narration exists
  const narrationExists = lecture.narration?.some((narr) => narr.id === narrationAssetId);
  if (!narrationExists) {
    throw new Error("Narration asset not found");
  }

  // Generate new run ID for the workflow
  const runId = randomUUID();

  // Send event to Inngest
  await inngest.send({
    name: "app/regenerate-single-narration",
    data: {
      userId: user.id,
      runId,
      lectureId,
      projectId: lecture.projectId,
      narrationAssetId,
      script,
      model,
      voice,
      emotion,
      config: lecture.config,
    } satisfies RegenerateSingleNarrationEvent,
  });

  return { runId, success: true };
}
