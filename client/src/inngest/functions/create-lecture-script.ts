import { openai } from "@ai-sdk/openai";
import { Output, streamText } from "ai";

import {
  buildCreateScriptPrompt,
  createScriptSystemPrompt,
  generatedScriptSchema,
} from "@/prompts/create-script";
import type {
  GeneralConfig,
  LectureScript,
  NarrationConfig,
  ResearchConfig,
} from "@/types/types";
import { DEFAULT_LECTURE_CONFIG } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";
import { getLectureById } from "@/data/lecture/repository";
import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";
import { LLM_MODELS } from "@/lib/models";

const inngest = getInngestApp();

const REASONING_MIN_DELTA = 40;

const safeSuggestedFormat = (value: unknown): "image" | "map" =>
  value === "map" || value === "image" ? value : "image";

const normaliseGeneratedScript = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const candidate = value as {
    title?: unknown;
    detailedSummary?: unknown;
    segments?: unknown;
  };

  const segments = Array.isArray(candidate.segments)
    ? candidate.segments.map((segment) => {
        if (typeof segment !== "object" || segment === null) {
          return segment;
        }

        const entry = segment as Record<string, unknown>;
        return {
          ...entry,
          suggestedFormat: safeSuggestedFormat(entry.suggestedFormat),
        };
      })
    : candidate.segments;

  return {
    ...candidate,
    segments,
  };
};

const extractText = (part: unknown): string => {
  if (typeof part !== "object" || part === null) {
    return "";
  }

  const candidate = part as Record<string, unknown>;
  const textValue = candidate.text ?? candidate.textDelta ?? candidate.delta;

  return typeof textValue === "string" ? textValue : "";
};

export type CreateLectureScriptEvent = {
  userId: string;
  prompt: string;
  runId: string;
  lectureId: number;
  totalWorkflowSteps?: number;
  researchConfig?: ResearchConfig;
  generalConfig?: GeneralConfig;
  narrationConfig?: NarrationConfig;
};

export type CreateLectureScriptResult = {
  runId: string;
  script: LectureScript;
};

export const createLectureScript = inngest.createFunction(
  { id: "create-lecture-script" },
  { event: "app/create-lecture-script" },
  async ({ event, publish, logger, step }) => {
    const {
      userId,
      prompt,
      runId,
      lectureId,
      totalWorkflowSteps = LECTURE_WORKFLOW_TOTAL_STEPS,
      researchConfig,
      generalConfig,
      narrationConfig,
    } = event.data as CreateLectureScriptEvent;

    // Use provided research config or fallback to defaults
    const model = researchConfig?.model ?? LLM_MODELS.GPT_5;
    const reasoningEffort = researchConfig?.reasoningEffort ?? "medium";
    const reasoningSummary = researchConfig?.reasoningSummary ?? "detailed";
    const scriptGeneralConfig = generalConfig ?? DEFAULT_LECTURE_CONFIG.general;
    const scriptNarrationConfig =
      narrationConfig ?? DEFAULT_LECTURE_CONFIG.narration;

    const log = createLectureLogger(runId, logger);
    const { publishStatus, publishReasoning, publishResult } =
      createLectureProgressPublisher({
        publish,
        userId,
        runId,
        totalSteps: totalWorkflowSteps,
        log,
      });

    // Check if we should skip this step (resume mode)
    const shouldSkip = await step.run("check-existing-script", async () => {
      const lecture = await getLectureById({ lectureId });
      const hasScript = lecture?.script != null;
      const forceRegenerate = (event.data as any).context?.forceRegenerate === true;
      return hasScript && !forceRegenerate;
    });

    if (shouldSkip) {
      const lecture = await getLectureById({ lectureId });
      await publishStatus("Using existing script", 1, "complete");
      await publishStatus("Lecture script ready", 2, "complete");
      log.info("Skipping script generation - using existing script");
      return { runId, script: lecture!.script!, skipped: true };
    }

    const rawModelOutput = await step.run("generate-script", async () => {
      await publishStatus("Prompt received", 1);

      log.info("Starting OpenAI generation", { promptLength: prompt.length });

      const result = streamText({
        model: openai(model),
        system: createScriptSystemPrompt,
        prompt: buildCreateScriptPrompt({
          topic: prompt,
          general: scriptGeneralConfig,
          narration: scriptNarrationConfig,
        }),
        experimental_output: Output.object({
          schema: generatedScriptSchema,
        }),
        providerOptions: {
          openai: {
            reasoningSummary,
            reasoningEffort,
            include: ["reasoning.encrypted_content"],
          },
        },
      });

      let reasoningBuffer = "";
      let lastPublishedReasoningLength = 0;
      let reasoningFinalised = false;

      const publishReasoningIfNeeded = async (force?: boolean) => {
        const trimmed = reasoningBuffer.trim();

        if (!trimmed) {
          return;
        }

        const hasDelta =
          trimmed.length - lastPublishedReasoningLength >= REASONING_MIN_DELTA;

        if (!force && !hasDelta) {
          return;
        }

        await publishReasoning(trimmed, Boolean(force));
        lastPublishedReasoningLength = trimmed.length;
      };

      for await (const part of result.fullStream) {
        switch (part.type) {
          case "reasoning-start": {
            reasoningBuffer = "";
            break;
          }
          case "reasoning-delta": {
            const deltaText = extractText(part);
            if (deltaText) {
              reasoningBuffer += deltaText;
              await publishReasoningIfNeeded();
            }
            break;
          }
          case "reasoning-end": {
            if (!reasoningFinalised && reasoningBuffer.trim()) {
              await publishReasoningIfNeeded(true);
              reasoningFinalised = true;
            }
            break;
          }
          case "finish": {
            log.info("Stream finished", { finishReason: part.finishReason });
            break;
          }
          default:
            break;
        }
      }

      if (!reasoningFinalised && reasoningBuffer.trim()) {
        await publishReasoningIfNeeded(true);
      }

      await publishStatus("Finalizing script...", 1);

      const finalText = await result.text;

      if (!finalText?.trim()) {
        throw new Error("Model returned empty script output");
      }

      return finalText;
    });

    const { script, title, summary } = await step.run("process-model-output", async () => {
      await publishStatus("Validating lecture script", 2);

      let parsed: unknown;

      try {
        parsed = JSON.parse(rawModelOutput);
      } catch (parseError) {
        const reason =
          parseError instanceof Error ? parseError.message : String(parseError);
        throw new Error(
          `Model returned invalid JSON for lecture script: ${reason}`
        );
      }

      const generatedScript = generatedScriptSchema.parse(
        normaliseGeneratedScript(parsed)
      );
      log.info("Script validated", {
        segments: generatedScript.segments.length,
        title: generatedScript.title,
      });

      // Extract application-level script (without suggestedFormat and detailedSummary)
      const script: LectureScript = {
        segments: generatedScript.segments.map(({ narration, backgroundMusic, effect }) => ({
          narration,
          backgroundMusic,
          effect,
        })),
      };

      await publishResult(script);

      return {
        script,
        title: generatedScript.title,
        summary: generatedScript.detailedSummary,
      };
    });

    await step.run("save-script", async () => {
      await publishStatus("Saving lecture script", 2, "in-progress");
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: {
          title,
          summary,
          script,
        },
      });
      await publishStatus("Lecture script ready", 2, "complete");
    });

    log.info("Lecture script generation completed");

    return { runId, script } satisfies CreateLectureScriptResult;
  }
);
