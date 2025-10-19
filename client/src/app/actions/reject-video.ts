"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type RejectVideoInput = {
  runId: string;
  videoAssetId: string;
};

export async function rejectVideoAction({ runId, videoAssetId }: RejectVideoInput) {
  const { user } = await getSession();

  await inngest.send({
    name: "app/video.rejected",
    data: {
      runId,
      videoAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
