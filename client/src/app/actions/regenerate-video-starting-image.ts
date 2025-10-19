"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getLectureById } from "@/data/lecture/repository";
import { getProjectSettings } from "@/data/project";
import { getInngestApp } from "@/inngest/client";
import type { RegenerateVideoStartingImageEvent } from "@/inngest/functions/regenerate-video-starting-image";
import type { LectureConfig } from "@/types/types";

const inngest = getInngestApp();

type RegenerateVideoStartingImageInput = {
  lectureId: number;
  videoAssetId: string;
  segmentStartImagePrompt: string;
  imageModel?: LectureConfig["video"]["imageModel"];
};

export async function regenerateVideoStartingImageAction({
  lectureId,
  videoAssetId,
  segmentStartImagePrompt,
  imageModel,
}: RegenerateVideoStartingImageInput) {
  const { user } = await getSession();

  const lecture = await getLectureById({ lectureId });
  if (!lecture) {
    throw new Error("Lecture not found");
  }

  const videoExists = lecture.videos?.some((video) => video.id === videoAssetId);
  if (!videoExists) {
    throw new Error("Video asset not found");
  }

  const projectSettings = await getProjectSettings(user.id);
  const runId = randomUUID();

  const payload: RegenerateVideoStartingImageEvent = {
    userId: user.id,
    runId,
    lectureId,
    projectId: lecture.projectId,
    videoAssetId,
    segmentStartImagePrompt,
    imageModel,
    config: projectSettings,
  };

  await inngest.send({
    name: "app/regenerate-video-starting-image",
    data: payload as any,
  });

  return { runId, success: true };
}
