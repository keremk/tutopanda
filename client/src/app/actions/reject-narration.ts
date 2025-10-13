"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type RejectNarrationInput = {
  runId: string;
  narrationAssetId: string;
};

export async function rejectNarrationAction({ runId, narrationAssetId }: RejectNarrationInput) {
  const { user } = await getSession();

  await inngest.send({
    name: "app/narration.rejected",
    data: {
      runId,
      narrationAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
