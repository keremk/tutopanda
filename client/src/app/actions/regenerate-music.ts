"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getLectureById } from "@/data/lecture/repository";
import { getProjectSettings } from "@/data/project";
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

  // Fetch lecture to validate access
  const lecture = await getLectureById({ lectureId });

  if (!lecture) {
    throw new Error("Lecture not found");
  }

  // Note: lecture ownership is already validated when fetching
  // getLectureById already ensures the lecture belongs to the user

  // Verify music exists
  const musicExists = lecture.music?.some((mus) => mus.id === musicAssetId);
  if (!musicExists) {
    throw new Error("Music asset not found");
  }

  // Fetch project settings
  const projectSettings = await getProjectSettings(user.id);

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
      config: projectSettings,
    } satisfies RegenerateSingleMusicEvent,
  });

  return { runId, success: true };
}
