"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getProjectSettings } from "@/data/project";
import { getInngestApp } from "@/inngest/client";
import type { LectureCreationEventData } from "@/inngest/functions/start-lecture-creation";
import {
  DEFAULT_IMAGE_GENERATION_DEFAULTS,
  DEFAULT_NARRATION_GENERATION_DEFAULTS,
  type ImageGenerationDefaults,
  type NarrationGenerationDefaults,
} from "@/types/types";

const inngest = getInngestApp();

type SendPromptInput = {
  prompt: string;
  lectureId: number;
  imageDefaults?: ImageGenerationDefaults;
  narrationDefaults?: NarrationGenerationDefaults;
};

export async function sendPromptAction({
  prompt,
  lectureId,
  imageDefaults,
  narrationDefaults,
}: SendPromptInput) {
  const cleanedPrompt = prompt.trim();

  if (!cleanedPrompt) {
    throw new Error("Prompt cannot be empty");
  }

  const { user } = await getSession();
  const runId = randomUUID();

  // Get project settings for image and narration defaults
  const projectSettings = await getProjectSettings(user.id);

  // Extract image settings from project settings if available
  const imageSettings = imageDefaults ?? {
    width: 1024, // Base width for calculations
    height: 576, // Base height
    aspectRatio: projectSettings.image.aspectRatio,
    size: projectSettings.image.size,
    style: projectSettings.image.style,
    imagesPerSegment: projectSettings.image.imagesPerSegment,
  };

  const narrationSettings = narrationDefaults ?? DEFAULT_NARRATION_GENERATION_DEFAULTS;

  await inngest.send({
    name: "app/start-lecture-creation",
    data: {
      prompt: cleanedPrompt,
      userId: user.id,
      runId,
      lectureId,
      imageDefaults: imageSettings,
      narrationDefaults: narrationSettings,
    } satisfies LectureCreationEventData,
  });

  return { runId };
}
