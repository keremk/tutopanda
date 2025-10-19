"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type AcceptVideoInput = {
  runId: string;
  videoAssetId: string;
};

export async function acceptVideoAction({ runId, videoAssetId }: AcceptVideoInput) {
  const { user } = await getSession();

  await inngest.send({
    name: "app/video.accepted",
    data: {
      runId,
      videoAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
