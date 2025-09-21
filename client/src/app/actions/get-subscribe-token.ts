// ex. /app/actions/get-subscribe-token.ts
"use server";

import { inngest } from "@/inngest/client";
// See the "Typed channels (recommended)" section above for more details:
import { userChannel } from "@/inngest/functions/helloWorld";
import { getSubscriptionToken, Realtime } from "@inngest/realtime";
import { getSession } from "@/app/lib/session"; // this could be any auth provider

export type UserChannelToken = Realtime.Token<typeof userChannel, ["ai"]>;

export async function fetchRealtimeSubscriptionToken(): Promise<UserChannelToken> {
  const { userId } = await getSession();

  // This creates a token using the Inngest API that is bound to the channel and topic:
  const token = await getSubscriptionToken(inngest, {
    channel: `user:${userId}`,
    topics: ["ai"],
  });

  return token;
}
