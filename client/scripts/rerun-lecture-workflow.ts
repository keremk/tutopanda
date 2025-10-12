import "dotenv/config";
import { randomUUID } from "node:crypto";

import { getInngestApp } from "@/inngest/client";
import { LECTURE_WORKFLOW_TOTAL_STEPS } from "@/inngest/functions/workflow-utils";
import { getLectureById } from "@/data/lecture/repository";
import { getProjectSettings } from "@/data/project";
import {
  createWorkflowRun,
  getWorkflowRun,
} from "@/data/workflow-runs";
import {
  DEFAULT_IMAGE_GENERATION_DEFAULTS,
  DEFAULT_NARRATION_GENERATION_DEFAULTS,
  type ImageGenerationDefaults,
} from "@/types/types";

type CliOptions = {
  baseRunId?: string;
  lectureId?: number;
  userId?: string;
  prompt?: string;
  force: boolean;
  waitForConfirmation: boolean;
};

const HELP_TEXT = `
Trigger a lecture workflow rerun from the command line.

Usage:
  pnpm --filter tutopanda-client workflow:rerun -- [options]

Options:
  --run-id <id>        Existing workflow run to base the retry on
  --lecture-id <id>    Lecture ID (required if --run-id not provided)
  --user-id <id>       User ID that owns the lecture (required if --run-id not provided)
  --prompt "<text>"    Optional prompt override for script regeneration
  --wait-for-confirmation  Require manual confirmation step instead of auto-approving
  --force              Force regeneration of all assets (skips reuse)
  -h, --help           Show this message
`.trim();

function showHelp() {
  console.log(HELP_TEXT);
}

function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = { force: false, waitForConfirmation: false };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    switch (arg) {
      case "--run-id":
      case "--run": {
        const value = argv[++index];
        if (!value) {
          throw new Error("Missing value for --run-id");
        }
        options.baseRunId = value;
        break;
      }
      case "--lecture-id":
      case "--lecture": {
        const value = argv[++index];
        if (!value) {
          throw new Error("Missing value for --lecture-id");
        }
        const parsed = Number.parseInt(value, 10);
        if (Number.isNaN(parsed)) {
          throw new Error(`Invalid lecture id: ${value}`);
        }
        options.lectureId = parsed;
        break;
      }
      case "--user-id":
      case "--user": {
        const value = argv[++index];
        if (!value) {
          throw new Error("Missing value for --user-id");
        }
        options.userId = value;
        break;
      }
      case "--prompt": {
        const value = argv[++index];
        if (!value) {
          throw new Error("Missing value for --prompt");
        }
        options.prompt = value;
        break;
      }
      case "--force": {
        options.force = true;
        break;
      }
      case "--wait-for-confirmation": {
        options.waitForConfirmation = true;
        break;
      }
      case "--help":
      case "-h": {
        showHelp();
        process.exit(0);
      }
      default: {
        throw new Error(`Unknown argument: ${arg}`);
      }
    }
  }

  return options;
}

function deriveImageDefaults(
  lectureConfig: unknown
): ImageGenerationDefaults {
  if (
    lectureConfig &&
    typeof lectureConfig === "object" &&
    (lectureConfig as Record<string, unknown>).image
  ) {
    const imageConfig = (lectureConfig as { image: Record<string, unknown> })
      .image;

    return {
      width: 1024,
      height: 576,
      aspectRatio: String(imageConfig.aspectRatio ?? "16:9") as ImageGenerationDefaults["aspectRatio"],
      size: String(imageConfig.size ?? "1080"),
      style: imageConfig.style as ImageGenerationDefaults["style"],
      imagesPerSegment:
        typeof imageConfig.imagesPerSegment === "number"
          ? imageConfig.imagesPerSegment
          : DEFAULT_IMAGE_GENERATION_DEFAULTS.imagesPerSegment,
    };
  }

  return { ...DEFAULT_IMAGE_GENERATION_DEFAULTS };
}

function buildContext(
  baseContext: Record<string, unknown> | null | undefined,
  force: boolean,
  baseRunId: string | undefined,
  waitForConfirmation: boolean
): Record<string, unknown> {
  const context: Record<string, unknown> = {};

  if (baseContext) {
    for (const [key, value] of Object.entries(baseContext)) {
      if (key === "forceRegenerate") {
        continue;
      }
      context[key] = value;
    }
  }

  if (baseRunId) {
    context.originalRunId = baseRunId;
  }

  context.retryAttempt = true;
  context.triggeredBy = "dev-script";
  context.triggeredAt = new Date().toISOString();

  if (force) {
    context.forceRegenerate = true;
  }

  context.skipConfirmation = !waitForConfirmation;

  return context;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const baseRun = options.baseRunId
    ? await getWorkflowRun(options.baseRunId)
    : null;

  if (options.baseRunId && !baseRun) {
    throw new Error(`Workflow run ${options.baseRunId} not found`);
  }

  const lectureId = options.lectureId ?? baseRun?.lectureId;
  if (!lectureId) {
    throw new Error("Provide --lecture-id or --run-id to identify the lecture");
  }

  const userId = options.userId ?? baseRun?.userId;
  if (!userId) {
    throw new Error("Provide --user-id or use --run-id to infer the owner");
  }

  const lecture = await getLectureById({ lectureId });
  if (!lecture) {
    throw new Error(`Lecture ${lectureId} not found`);
  }

  // Fetch project settings for image defaults
  const projectSettings = await getProjectSettings(userId);
  const imageDefaults = deriveImageDefaults(projectSettings);
  const narrationDefaults = { ...DEFAULT_NARRATION_GENERATION_DEFAULTS };
  const newRunId = randomUUID();
  const context = buildContext(
    baseRun?.context,
    options.force,
    options.baseRunId,
    options.waitForConfirmation
  );
  const prompt =
    options.prompt ??
    (typeof lecture.summary === "string" && lecture.summary.trim()
      ? lecture.summary
      : "Developer rerun");

  await createWorkflowRun({
    runId: newRunId,
    lectureId,
    userId,
    totalSteps: LECTURE_WORKFLOW_TOTAL_STEPS,
    status: "queued",
    context,
  });

  const inngest = getInngestApp();

  await inngest.send({
    name: "app/start-lecture-creation",
    data: {
      prompt,
      userId,
      runId: newRunId,
      lectureId,
      imageDefaults,
      narrationDefaults,
      context,
    },
  });

  console.log(
    [
      `Triggered lecture workflow for lecture ${lectureId}`,
      `new run id: ${newRunId}`,
      options.force ? "mode: force regenerate" : "mode: reuse existing assets",
    ].join(" | ")
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
