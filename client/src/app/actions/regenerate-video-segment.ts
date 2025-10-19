"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getLectureById } from "@/data/lecture/repository";
import { getProjectSettings } from "@/data/project";
import { getInngestApp } from "@/inngest/client";
import type { RegenerateVideoSegmentEvent } from "@/inngest/functions/regenerate-video-segment";
import type { LectureConfig } from "@/types/types";

const inngest = getInngestApp();

type RegenerateVideoSegmentInput = {
  lectureId: number;
  videoAssetId: string;
  movieDirections: string;
  model?: LectureConfig["video"]["model"];
};

export async function regenerateVideoSegmentAction({
  lectureId,
  videoAssetId,
  movieDirections,
  model,
}: RegenerateVideoSegmentInput) {
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

  const payload: RegenerateVideoSegmentEvent = {
    userId: user.id,
    runId,
    lectureId,
    projectId: lecture.projectId,
    videoAssetId,
    movieDirections,
    model,
    config: projectSettings,
  };

  await inngest.send({
    name: "app/regenerate-video-segment",
    data: payload as any,
  });

  return { runId, success: true };
}
