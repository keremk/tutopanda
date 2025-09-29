"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getInngestApp } from "@/inngest/client";
import type { LectureCreationEventData } from "@/inngest/functions/start-lecture-creation";
import {
  DEFAULT_IMAGE_GENERATION_DEFAULTS,
  type ImageGenerationDefaults,
} from "@/types/types";

const inngest = getInngestApp();

type SendPromptInput = {
  prompt: string;
  lectureId: number;
  imageDefaults?: ImageGenerationDefaults;
};

export async function sendPromptAction({
  prompt,
  lectureId,
  imageDefaults,
}: SendPromptInput) {
  const cleanedPrompt = prompt.trim();

  if (!cleanedPrompt) {
    throw new Error("Prompt cannot be empty");
  }

  const { user } = await getSession();
  const runId = randomUUID();

  const defaults = imageDefaults ?? DEFAULT_IMAGE_GENERATION_DEFAULTS;

  await inngest.send({
    name: "app/start-lecture-creation",
    data: {
      prompt: cleanedPrompt,
      userId: user.id,
      runId,
      lectureId,
      imageDefaults: defaults,
    } satisfies LectureCreationEventData,
  });

  return { runId };
}
