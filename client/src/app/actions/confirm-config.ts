"use server";

import { getInngestApp } from "@/inngest/client";
import { updateLectureContent } from "@/services/lecture/persist";
import { getSession } from "@/lib/session";
import type { LectureConfig } from "@/types/types";

const inngest = getInngestApp();

type AcceptConfigInput = {
  runId: string;
  lectureId: number;
  config: LectureConfig;
};

export async function acceptConfigAction({ runId, lectureId, config }: AcceptConfigInput) {
  const { user } = await getSession();

  // Send confirmation event to Inngest
  await inngest.send({
    name: "app/config.confirmed",
    data: {
      runId,
      lectureId,
      userId: user.id,
      config,
    },
  });

  return { success: true };
}

type UpdateConfigInput = {
  runId: string;
  lectureId: number;
  config: LectureConfig;
};

export async function updateConfigAction({ runId, lectureId, config }: UpdateConfigInput) {
  const { user } = await getSession();

  // Update config in database
  await updateLectureContent({
    lectureId,
    actorId: user.id,
    payload: { config },
  });

  // Send confirmation event to Inngest
  await inngest.send({
    name: "app/config.confirmed",
    data: {
      runId,
      lectureId,
      userId: user.id,
      config,
    },
  });

  return { success: true };
}
