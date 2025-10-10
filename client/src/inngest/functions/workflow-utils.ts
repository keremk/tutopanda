import { channel, topic } from "@inngest/realtime";

import type { LectureScript } from "@/prompts/create-script";
import type { LectureConfig, ImageAsset, NarrationSettings, MusicSettings } from "@/types/types";

export const LECTURE_WORKFLOW_TOTAL_STEPS = 6; // 0: config, 1: script, 2: images, 3: narration, 4: music, 5: timeline

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

export type LectureTimelineCompleteMessage = {
  type: "timeline-complete";
  runId: string;
  lectureId: number;
  timestamp: string;
};

export type LectureConfigMessage = {
  type: "config";
  runId: string;
  config: LectureConfig;
  timestamp: string;
};

export type LectureImagePreviewMessage = {
  type: "image-preview";
  runId: string;
  imageAssetId: string;
  imageAsset: ImageAsset;
  timestamp: string;
};

export type LectureImageCompleteMessage = {
  type: "image-complete";
  runId: string;
  lectureId: number;
  imageAssetId: string;
  timestamp: string;
};

export type LectureNarrationPreviewMessage = {
  type: "narration-preview";
  runId: string;
  narrationAssetId: string;
  narrationAsset: NarrationSettings;
  timestamp: string;
};

export type LectureNarrationCompleteMessage = {
  type: "narration-complete";
  runId: string;
  lectureId: number;
  narrationAssetId: string;
  timestamp: string;
};

export type LectureMusicPreviewMessage = {
  type: "music-preview";
  runId: string;
  musicAssetId: string;
  musicAsset: MusicSettings;
  timestamp: string;
};

export type LectureMusicCompleteMessage = {
  type: "music-complete";
  runId: string;
  lectureId: number;
  musicAssetId: string;
  timestamp: string;
};

export type LectureProgressMessage =
  | LectureStatusMessage
  | LectureReasoningMessage
  | LectureResultMessage
  | LectureTimelineCompleteMessage
  | LectureConfigMessage
  | LectureImagePreviewMessage
  | LectureImageCompleteMessage
  | LectureNarrationPreviewMessage
  | LectureNarrationCompleteMessage
  | LectureMusicPreviewMessage
  | LectureMusicCompleteMessage;

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

  const publishConfig = async (config: LectureConfig) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "config",
        runId,
        config,
        timestamp: nowIso(),
      })
    );

    log.info("Config published", { config });
  };

  const publishImagePreview = async (imageAssetId: string, imageAsset: ImageAsset) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "image-preview",
        runId,
        imageAssetId,
        imageAsset,
        timestamp: nowIso(),
      })
    );

    log.info("Image preview published", { imageAssetId, imageAsset });
  };

  const publishImageComplete = async (lectureId: number, imageAssetId: string) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "image-complete",
        runId,
        lectureId,
        imageAssetId,
        timestamp: nowIso(),
      })
    );

    log.info("Image completion published", { lectureId, imageAssetId });
  };

  const publishNarrationPreview = async (narrationAssetId: string, narrationAsset: NarrationSettings) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "narration-preview",
        runId,
        narrationAssetId,
        narrationAsset,
        timestamp: nowIso(),
      })
    );

    log.info("Narration preview published", { narrationAssetId, narrationAsset });
  };

  const publishNarrationComplete = async (lectureId: number, narrationAssetId: string) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "narration-complete",
        runId,
        lectureId,
        narrationAssetId,
        timestamp: nowIso(),
      })
    );

    log.info("Narration completion published", { lectureId, narrationAssetId });
  };

  const publishMusicPreview = async (musicAssetId: string, musicAsset: MusicSettings) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "music-preview",
        runId,
        musicAssetId,
        musicAsset,
        timestamp: nowIso(),
      })
    );

    log.info("Music preview published", { musicAssetId, musicAsset });
  };

  const publishMusicComplete = async (lectureId: number, musicAssetId: string) => {
    await publish(
      lectureProgressChannel(userId).progress({
        type: "music-complete",
        runId,
        lectureId,
        musicAssetId,
        timestamp: nowIso(),
      })
    );

    log.info("Music completion published", { lectureId, musicAssetId });
  };

  return {
    publishStatus,
    publishReasoning,
    publishResult,
    publishConfig,
    publishImagePreview,
    publishImageComplete,
    publishNarrationPreview,
    publishNarrationComplete,
    publishMusicPreview,
    publishMusicComplete,
  };
};
