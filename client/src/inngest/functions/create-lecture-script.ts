import { openai } from "@ai-sdk/openai";
import { Output, streamText } from "ai";

import {
  buildCreateScriptPrompt,
  createScriptSystemPrompt,
  lectureScriptSchema,
  type LectureScript,
} from "@/prompts/create-script";
import { updateLectureContent } from "@/services/lecture/persist";
import { getInngestApp } from "@/inngest/client";
import {
  createLectureLogger,
  createLectureProgressPublisher,
  LECTURE_WORKFLOW_TOTAL_STEPS,
} from "@/inngest/functions/workflow-utils";

const inngest = getInngestApp();

const REASONING_MIN_DELTA = 120;

const safeSuggestedFormat = (value: unknown): "image" | "map" =>
  value === "map" || value === "image" ? value : "image";

const normaliseScriptCandidate = (value: unknown): unknown => {
  if (typeof value !== "object" || value === null) {
    return value;
  }

  const candidate = value as {
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
    } = event.data as CreateLectureScriptEvent;

    const log = createLectureLogger(runId, logger);
    const { publishStatus, publishReasoning, publishResult } =
      createLectureProgressPublisher({
        publish,
        userId,
        runId,
        totalSteps: totalWorkflowSteps,
        log,
      });

    const rawModelOutput = await step.run("generate-script", async () => {
      await publishStatus("Prompt received", 1);
      await publishStatus("Drafting lecture with OpenAI", 1);

      log.info("Starting OpenAI generation", { promptLength: prompt.length });

      const result = streamText({
        model: openai("gpt-5"),
        system: createScriptSystemPrompt,
        prompt: buildCreateScriptPrompt(prompt),
        experimental_output: Output.object({
          schema: lectureScriptSchema,
        }),
        providerOptions: {
          openai: {
            reasoningSummary: "detailed",
            reasoningEffort: "medium",
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

      const finalText = await result.text;

      if (!finalText?.trim()) {
        throw new Error("Model returned empty script output");
      }

      await publishStatus("OpenAI response received", 1, "complete");

      return finalText;
    });

    const script = await step.run("process-model-output", async () => {
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

      const scriptFromModel = lectureScriptSchema.parse(
        normaliseScriptCandidate(parsed)
      );
      log.info("Script validated", {
        segments: scriptFromModel.segments.length,
      });

      await publishResult(scriptFromModel);

      return scriptFromModel;
    });

    await step.run("save-script", async () => {
      await publishStatus("Saving lecture script", 2, "in-progress");
      await updateLectureContent({
        lectureId,
        actorId: userId,
        payload: { script },
      });
      await publishStatus("Lecture script ready", 2, "complete");
    });

    log.info("Lecture script generation completed");

    return { runId, script } satisfies CreateLectureScriptResult;
  }
);
