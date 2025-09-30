import Replicate from "replicate";
import { openai } from "@ai-sdk/openai";
import { generateText } from "ai";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import type { LectureScript } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getProjectById } from "@/data/project";
import { setupFileStorage, saveFileToStorage } from "@/lib/storage-utils";
import {
  createMusicPromptSystemPrompt,
  buildMusicPromptUserMessage,
} from "@/prompts/create-music-prompt";

const inngest = getInngestApp();
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

const MUSIC_GENERATION_WORKFLOW_STEP = 6;

export type GenerateMusicEvent = {
  userId: string;
  runId: string;
  lectureId: number;
  projectId: number;
  script: LectureScript;
  durationSeconds: number;
  workflowStep?: number;
  totalWorkflowSteps?: number;
};

const generateMusicForScript = async (
  prompt: string,
  durationSeconds: number
): Promise<Buffer> => {
  const input = {
    prompt,
    duration: Math.round(durationSeconds), // Must be an integer
  };

  const output = await replicate.run("stability-ai/stable-audio-2.5", {
    input,
  }) as any;

  if (!output) {
    throw new Error("Music generation failed - no output returned");
  }

  // Fetch the audio file from the URL
  const response = await fetch(output.url());
  if (!response.ok) {
    throw new Error(`Failed to download music: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

export const generateMusic = inngest.createFunction(
  { id: "generate-music" },
  { event: "app/generate-music" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      runId,
      lectureId,
      projectId,
      script,
      durationSeconds,
      workflowStep = MUSIC_GENERATION_WORKFLOW_STEP,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
    } = event.data as GenerateMusicEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    const segments = script?.segments ?? [];
    if (segments.length === 0) {
      const message = "No script segments available for music generation";
      log.error(message);
      await publishStatus(message, workflowStep, "error");
      throw new Error(message);
    }

    await step.run("validate-project-access", async () => {
      const project = await getProjectById(projectId, userId);
      if (!project) {
        throw new Error(`Project ${projectId} not found or access denied`);
      }
    });

    await publishStatus("Generating music prompt", workflowStep);

    const musicPrompt = await step.run("generate-music-prompt", async () => {
      const userPrompt = buildMusicPromptUserMessage({
        script,
        durationSeconds,
      });

      log.info("Generating music prompt", {
        durationSeconds,
        segmentCount: segments.length,
      });

      const { text } = await generateText({
        model: openai("gpt-4o"),
        system: createMusicPromptSystemPrompt,
        prompt: userPrompt,
      });

      const promptText = text.trim();

      if (!promptText) {
        throw new Error("Model returned empty music prompt");
      }

      log.info("Music prompt generated", {
        promptLength: promptText.length,
      });

      return promptText;
    });

    await publishStatus("Generating background music", workflowStep);

    const storage = setupFileStorage();
    const filePath = `${userId}/${projectId}/musical-score/score-${lectureId}.mp3`;

    const fileSize = await step.run("generate-and-save-music", async () => {
      log.info("Generating music", {
        prompt: musicPrompt.substring(0, 100) + "...",
        durationSeconds,
      });

      const musicBuffer = await generateMusicForScript(musicPrompt, durationSeconds);
      await saveFileToStorage(storage, musicBuffer, filePath);

      log.info("Music file saved", { filePath });
      return musicBuffer.length;
    });

    await publishStatus("Background music generated successfully", workflowStep, "complete");

    log.info("Music generation complete", {
      fileSize,
      filePath,
    });

    await step.run("save-music-metadata", async () => {
      const musicAsset = {
        id: `music-${runId}`,
        label: "Background Score",
        prompt: musicPrompt,
        duration: durationSeconds,
        audioUrl: filePath,
      };

      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: {
          music: [musicAsset],
        },
      });
    });

    return {
      runId,
      music: {
        id: `music-${runId}`,
        label: "Background Score",
        audioUrl: filePath,
        prompt: musicPrompt,
        duration: durationSeconds,
      },
    };
  }
);