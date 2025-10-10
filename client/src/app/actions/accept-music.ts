"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type AcceptMusicInput = {
  runId: string;
  musicAssetId: string;
};

export async function acceptMusicAction({ runId, musicAssetId }: AcceptMusicInput) {
  const { user } = await getSession();

  // Send acceptance event to Inngest
  await inngest.send({
    name: "app/music.accepted",
    data: {
      runId,
      musicAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
