"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getLectureById } from "@/data/lecture/repository";
import { getInngestApp } from "@/inngest/client";
import type { RegenerateSingleMusicEvent } from "@/inngest/functions/regenerate-single-music";
import type { LectureConfig } from "@/types/types";

const inngest = getInngestApp();

type RegenerateMusicInput = {
  lectureId: number;
  musicAssetId: string;
  prompt: string;
  durationSeconds: number;
  model?: string;
};

export async function regenerateMusicAction({
  lectureId,
  musicAssetId,
  prompt,
  durationSeconds,
  model,
}: RegenerateMusicInput) {
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

  // Verify music exists
  const musicExists = lecture.music?.some((mus) => mus.id === musicAssetId);
  if (!musicExists) {
    throw new Error("Music asset not found");
  }

  // Generate new run ID for the workflow
  const runId = randomUUID();

  // Send event to Inngest
  await inngest.send({
    name: "app/regenerate-single-music",
    data: {
      userId: user.id,
      runId,
      lectureId,
      projectId: lecture.projectId,
      musicAssetId,
      prompt,
      durationSeconds,
      model,
      config: lecture.config,
    } satisfies RegenerateSingleMusicEvent,
  });

  return { runId, success: true };
}
