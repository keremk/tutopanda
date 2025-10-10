"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type AcceptNarrationInput = {
  runId: string;
  narrationAssetId: string;
};

export async function acceptNarrationAction({ runId, narrationAssetId }: AcceptNarrationInput) {
  const { user } = await getSession();

  // Send acceptance event to Inngest
  await inngest.send({
    name: "app/narration.accepted",
    data: {
      runId,
      narrationAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
