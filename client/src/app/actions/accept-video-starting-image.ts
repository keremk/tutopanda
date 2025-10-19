"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type AcceptVideoStartingImageInput = {
  runId: string;
  videoAssetId: string;
};

export async function acceptVideoStartingImageAction({
  runId,
  videoAssetId,
}: AcceptVideoStartingImageInput) {
  const { user } = await getSession();

  await inngest.send({
    name: "app/video-image.accepted",
    data: {
      runId,
      videoAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
