"use server";

import { getSubscriptionToken, Realtime } from "@inngest/realtime";

import { lectureProgressChannel } from "@/inngest/functions/workflow-utils";
import { getSession } from "@/lib/session";
import { getInngestApp } from "@/inngest/client";

const inngest = getInngestApp();

export type LectureProgressToken = Realtime.Token<
  typeof lectureProgressChannel,
  ["progress"]
>;

export async function fetchLectureProgressSubscriptionToken(): Promise<LectureProgressToken> {
  const { user } = await getSession();

  return getSubscriptionToken(inngest, {
    channel: lectureProgressChannel(user.id),
    topics: ["progress"],
  });
}
