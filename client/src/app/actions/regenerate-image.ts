"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getLectureById } from "@/data/lecture/repository";
import { getInngestApp } from "@/inngest/client";
import type { RegenerateSingleImageEvent } from "@/inngest/functions/regenerate-single-image";
import type { LectureConfig } from "@/types/types";

const inngest = getInngestApp();

type RegenerateImageInput = {
  lectureId: number;
  imageAssetId: string;
  prompt: string;
  model?: string;
};

export async function regenerateImageAction({
  lectureId,
  imageAssetId,
  prompt,
  model,
}: RegenerateImageInput) {
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

  // Verify image exists
  const imageExists = lecture.images?.some((img) => img.id === imageAssetId);
  if (!imageExists) {
    throw new Error("Image asset not found");
  }

  // Generate new run ID for the workflow
  const runId = randomUUID();

  // Send event to Inngest
  await inngest.send({
    name: "app/regenerate-single-image",
    data: {
      userId: user.id,
      runId,
      lectureId,
      projectId: lecture.projectId,
      imageAssetId,
      prompt,
      model,
      config: lecture.config,
    } satisfies RegenerateSingleImageEvent,
  });

  return { runId, success: true };
}
