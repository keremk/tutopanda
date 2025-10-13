"use server";

import { getInngestApp } from "@/inngest/client";
import { getSession } from "@/lib/session";

const inngest = getInngestApp();

type RejectMusicInput = {
  runId: string;
  musicAssetId: string;
};

export async function rejectMusicAction({ runId, musicAssetId }: RejectMusicInput) {
  const { user } = await getSession();

  await inngest.send({
    name: "app/music.rejected",
    data: {
      runId,
      musicAssetId,
      userId: user.id,
    },
  });

  return { success: true };
}
