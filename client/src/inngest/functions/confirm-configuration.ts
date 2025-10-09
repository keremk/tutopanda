import { openai } from "@ai-sdk/openai";
import { generateObject } from "ai";

import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
} from "@/inngest/functions/workflow-utils";
import {
  extractConfigSystemPrompt,
  buildExtractConfigPrompt,
  extractedConfigSchema,
  type ExtractedConfig,
} from "@/prompts/extract-config";
import { updateLectureContent } from "@/services/lecture/persist";
import { getLectureById } from "@/data/lecture/repository";
import type { LectureConfig } from "@/types/types";

const inngest = getInngestApp();

export type ConfirmConfigurationEvent = {
  userId: string;
  prompt: string;
  runId: string;
  lectureId: number;
  defaultConfig: LectureConfig;
  totalWorkflowSteps?: number;
  context?: Record<string, unknown>;
};

export type ConfirmConfigurationResult = {
  config: LectureConfig;
};

const mergeConfigs = (
  defaultConfig: LectureConfig,
  extracted: ExtractedConfig
): LectureConfig => {
  return {
    general: {
      ...defaultConfig.general,
      ...(extracted.general || {}),
    },
    image: {
      ...defaultConfig.image,
      ...(extracted.image || {}),
    },
    video: defaultConfig.video, // Video config not extracted from prompt
    narration: {
      ...defaultConfig.narration,
      ...(extracted.narration || {}),
    },
    music: {
      ...defaultConfig.music,
      ...(extracted.music || {}),
    },
    soundEffects: {
      ...defaultConfig.soundEffects,
      ...(extracted.soundEffects || {}),
    },
  };
};

export const confirmConfiguration = inngest.createFunction(
  { id: "confirm-configuration" },
  { event: "app/confirm-configuration" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      prompt,
      runId,
      lectureId,
      defaultConfig,
      totalWorkflowSteps = 7,
      context: eventContext,
    } =
      event.data as ConfirmConfigurationEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus, publishConfig } = createLectureProgressPublisher({
      publish,
      userId,
      runId,
      totalSteps: totalWorkflowSteps,
      log,
    });

    // Send immediate progress update
    await publishStatus("Starting configuration analysis", 0);

    // Step 1: Extract config from prompt using LLM
    const extractedConfig = await step.run("extract-config-from-prompt", async () => {
      await publishStatus("Analyzing prompt for preferences", 0);

      log.info("Extracting config from prompt", { promptLength: prompt.length });

      const result = await generateObject({
        model: openai("gpt-4o-mini"),
        system: extractConfigSystemPrompt,
        prompt: buildExtractConfigPrompt(prompt),
        schema: extractedConfigSchema,
      });

      log.info("Config extracted", { extracted: result.object });
      return result.object;
    });

    // Step 2: Merge with default config
    const mergedConfig = await step.run("merge-config", async () => {
      const config = mergeConfigs(defaultConfig, extractedConfig);
      log.info("Config merged with defaults", { config });
      return config;
    });

    // Step 3: Save config to database
    await step.run("save-config", async () => {
      await publishStatus("Saving configuration", 0);
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { config: mergedConfig },
      });
      log.info("Config saved to database");
    });

    // Step 4: Publish config to UI
    await step.run("publish-config-to-ui", async () => {
      await publishConfig(mergedConfig);
      await publishStatus("Configuration ready for review", 0, "complete");
      log.info("Config published to UI");
    });

    const skipConfirmation = eventContext?.skipConfirmation === true;

    if (!skipConfirmation) {
      // Step 5: Wait for user confirmation or update
      const confirmationEvent = await step.waitForEvent("wait-for-config-confirmation", {
        event: "app/config.confirmed",
        timeout: "5m",
        match: "data.runId",
      });

      if (!confirmationEvent) {
        throw new Error("Configuration confirmation timeout");
      }
    } else {
      await publishStatus("Configuration auto-confirmed", 0, "complete");
      log.info("Skipping configuration confirmation due to context flag");
    }

    // Step 6: Get final config (might have been updated by user)
    const finalConfig = await step.run("get-final-config", async () => {
      const lecture = await getLectureById({ lectureId });
      if (!lecture?.config) {
        throw new Error("Config not found after confirmation");
      }
      log.info("Final config retrieved", { config: lecture.config });
      return lecture.config;
    });

    log.info("Configuration confirmed");
    return { config: finalConfig } satisfies ConfirmConfigurationResult;
  }
);
