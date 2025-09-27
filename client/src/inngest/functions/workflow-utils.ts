import { channel, topic } from "@inngest/realtime";

import type { LectureScript } from "@/prompts/create-script";

export const LECTURE_WORKFLOW_TOTAL_STEPS = 7;

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

export const lectureProgressChannel = channel((userId: string) => `user:${userId}`)
  .addTopic(topic("progress").type<LectureProgressMessage>());

const nowIso = () => new Date().toISOString();

export type WorkflowLogger = {
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

export const createLectureProgressPublisher = <TPublish extends (event: any) => Promise<unknown>>({
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
