"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type AcceptImageInput = {
  runId: string;
  imageAssetId: string;
};

export async function acceptImageAction({ runId, imageAssetId }: AcceptImageInput) {
  const { user } = await getSession();

  // Send acceptance event to Inngest
  await inngest.send({
    name: "app/image.accepted",
    data: {
      runId,
      imageAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
