"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type RejectImageInput = {
  runId: string;
  imageAssetId: string;
};

export async function rejectImageAction({ runId, imageAssetId }: RejectImageInput) {
  const { user } = await getSession();

  await inngest.send({
    name: "app/image.rejected",
    data: {
      runId,
      imageAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
