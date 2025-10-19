"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type RejectVideoStartingImageInput = {
  runId: string;
  videoAssetId: string;
};

export async function rejectVideoStartingImageAction({
  runId,
  videoAssetId,
}: RejectVideoStartingImageInput) {
  const { user } = await getSession();

  await inngest.send({
    name: "app/video-image.rejected",
    data: {
      runId,
      videoAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
