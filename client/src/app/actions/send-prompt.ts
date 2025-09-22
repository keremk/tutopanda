"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getInngestApp } from "@/inngest/client";
import type { LectureCreationEventData } from "@/inngest/functions/start-lecture-creation";

const inngest = getInngestApp();

type SendPromptInput = {
  prompt: string;
};

export async function sendPromptAction({ prompt }: SendPromptInput) {
  const cleanedPrompt = prompt.trim();

  if (!cleanedPrompt) {
    throw new Error("Prompt cannot be empty");
  }

  const { user } = await getSession();
  const runId = randomUUID();

  await inngest.send({
    name: "app/start-lecture-creation",
    data: {
      prompt: cleanedPrompt,
      userId: user.id,
      runId,
    } satisfies LectureCreationEventData,
  });

  return { runId };
}
