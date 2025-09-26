import { openai } from "@ai-sdk/openai";
import { Output, streamText } from "ai";
import { channel, topic } from "@inngest/realtime";

import {
  buildCreateScriptPrompt,
  createScriptSystemPrompt,
  lectureScriptSchema,
  type LectureScript,
} from "@/prompts/create-script";
import { getInngestApp } from "@/inngest/client";

export type { LectureScript } from "@/prompts/create-script";

export type LectureRunStatus = "in-progress" | "complete" | "error";

export type LectureStatusMessage = {
  type: "status";
  runId: string;
  message: string;
  status: LectureRunStatus;
  step: number;
  totalSteps: number;
  timestamp: string;
};

export type LectureReasoningMessage = {
  type: "reasoning";
  runId: string;
  text: string;
  isFinal: boolean;
  timestamp: string;
};

export type LectureResultMessage = {
  type: "result";
  runId: string;
  script: LectureScript;
  timestamp: string;
};

export type LectureProgressMessage =
  | LectureStatusMessage
  | LectureReasoningMessage
  | LectureResultMessage;

export type LectureCreationEventData = {
  prompt: string;
  userId: string;
  runId: string;
};

export const lectureProgressChannel = channel((userId: string) => `user:${userId}`)
  .addTopic(topic("progress").type<LectureProgressMessage>());

const inngest = getInngestApp();

const SCRIPT_TOTAL_STEPS = 2;
const REASONING_MIN_DELTA = 120;

const nowIso = () => new Date().toISOString();

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

type WorkflowLogger = {
  info?: (message: string, data?: Record<string, unknown>) => void;
  error?: (message: string, data?: Record<string, unknown>) => void;
};

export const createLectureLogger = (runId: string, logger?: WorkflowLogger) => {
  const prefix = `[lecture-workflow:${runId}]`;

  return {
    info(message: string, data?: Record<string, unknown>) {
      if (logger?.info) {
        logger.info(message, { runId, ...(data ?? {}) });
      } else {
        console.log(prefix, message, data ?? {});
      }
    },
    error(message: string, data?: Record<string, unknown>) {
      if (logger?.error) {
        logger.error(message, { runId, ...(data ?? {}) });
      } else {
        console.error(prefix, message, data ?? {});
      }
    },
  };
};

const createLectureProgressPublisher = <TPublish extends (event: any) => Promise<unknown>>({
  publish,
  userId,
  runId,
  totalSteps,
  log,
}: {
  publish: TPublish;
  userId: string;
  runId: string;
  totalSteps: number;
  log: ReturnType<typeof createLectureLogger>;
}) => {
  const publishStatus = async (
    message: string,
    stepIndex: number,
    status: LectureRunStatus = "in-progress"
  ) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "status",
        runId,
        message,
        status,
        step: stepIndex,
        totalSteps,
        timestamp: nowIso(),
      })
    );

    log.info("Status", { message, stepIndex, status });
  };

  const publishReasoning = async (text: string, isFinal: boolean) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "reasoning",
        runId,
        text,
        isFinal,
        timestamp: nowIso(),
      })
    );

    log.info("Reasoning", { characters: text.length, isFinal });
  };

  const publishResult = async (script: LectureScript) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "result",
        runId,
        script,
        timestamp: nowIso(),
      })
    );

    log.info("Result published", { segments: script.segments.length });
  };

  return {
    publishStatus,
    publishReasoning,
    publishResult,
  };
};

export const createLectureScript = inngest.createFunction(
  { id: "create-lecture-script" },
  { event: "app/create-lecture-script" },
  async ({ event, publish, logger, step }) => {
    const { userId, prompt, runId } = event.data as LectureCreationEventData;
    const log = createLectureLogger(runId, logger);
    const { publishStatus, publishReasoning, publishResult } =
      createLectureProgressPublisher({
        publish,
        userId,
        runId,
        totalSteps: SCRIPT_TOTAL_STEPS,
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
        throw new Error(`Model returned invalid JSON for lecture script: ${reason}`);
      }

      const scriptFromModel = lectureScriptSchema.parse(
        normaliseScriptCandidate(parsed)
      );
      log.info("Script validated", { segments: scriptFromModel.segments.length });

      await publishStatus("Lecture script ready", 2, "complete");
      await publishResult(scriptFromModel);

      return scriptFromModel;
    });

    log.info("Lecture script generation completed");

    return { runId, script };
  }
);

export const startLectureCreation = inngest.createFunction(
  { id: "start-lecture-creation" },
  { event: "app/start-lecture-creation" },
  async ({ event, logger, step }) => {
    const { userId, prompt, runId } = event.data as LectureCreationEventData;
    const log = createLectureLogger(runId, logger);

    log.info("Starting lecture workflow");

    const { script } = await step.invoke("create-lecture-script", {
      function: createLectureScript,
      data: {
        userId,
        prompt,
        runId,
      },
    });

    log.info("Lecture workflow completed", { hasScript: Boolean(script) });

    return { runId };
  }
);
