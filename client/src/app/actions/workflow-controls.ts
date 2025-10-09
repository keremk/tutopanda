"use server";

import { randomUUID } from "node:crypto";

import { getSession } from "@/lib/session";
import { getWorkflowRun, updateWorkflowRun } from "@/data/workflow-runs";
import { getLectureById } from "@/data/lecture/repository";
import { getInngestApp } from "@/inngest/client";
import type { LectureCreationEventData } from "@/inngest/functions/start-lecture-creation";
import {
  DEFAULT_IMAGE_GENERATION_DEFAULTS,
  DEFAULT_NARRATION_GENERATION_DEFAULTS,
} from "@/types/types";

const inngest = getInngestApp();

/**
 * Cancel a running workflow
 */
export async function cancelWorkflowAction(runId: string) {
  const { user } = await getSession();

  const workflowRun = await getWorkflowRun(runId);

  if (!workflowRun) {
    throw new Error("Workflow run not found");
  }

  if (workflowRun.userId !== user.id) {
    throw new Error("Unauthorized");
  }

  // Update status to cancelled
  await updateWorkflowRun({
    runId,
    status: "failed", // Using 'failed' as we don't have 'cancelled' in the enum yet
    context: {
      ...workflowRun.context,
      cancelled: true,
      cancelledAt: new Date().toISOString(),
    },
  });

  // TODO: Call Inngest API to cancel the run if available
  // For now, the workflow will see the status change and can respond accordingly

  return { success: true };
}

/**
 * Rerun a failed or cancelled workflow
 */
export async function rerunWorkflowAction(
  runId: string,
  options: {
    resumeFromFailure?: boolean;
    forceAll?: boolean;
  } = {}
) {
  const { user } = await getSession();
  const { resumeFromFailure = true, forceAll = false } = options;

  const workflowRun = await getWorkflowRun(runId);

  if (!workflowRun) {
    throw new Error("Workflow run not found");
  }

  if (workflowRun.userId !== user.id) {
    throw new Error("Unauthorized");
  }

  const lecture = await getLectureById({ lectureId: workflowRun.lectureId });

  if (!lecture) {
    throw new Error("Lecture not found");
  }

  // Generate new run ID for the retry
  const newRunId = randomUUID();

  // Determine what to regenerate based on mode
  const context: Record<string, unknown> = {
    originalRunId: runId,
    retryAttempt: true,
  };

  if (forceAll) {
    // Force regenerate everything
    context.forceRegenerate = true;
  } else if (resumeFromFailure) {
    // Resume from where it failed - skip completed steps
    const completedSteps = (workflowRun.context?.completedSteps as number[]) || [];
    context.completedSteps = completedSteps;
    context.resumeMode = true;
  }

  // Extract image settings from lecture config
  const imageSettings = lecture.config?.image
    ? {
        width: 1024,
        height: 576,
        aspectRatio: lecture.config.image.aspectRatio,
        size: lecture.config.image.size,
        style: lecture.config.image.style,
        imagesPerSegment: lecture.config.image.imagesPerSegment,
      }
    : DEFAULT_IMAGE_GENERATION_DEFAULTS;

  // Trigger new workflow run
  await inngest.send({
    name: "app/start-lecture-creation",
    data: {
      prompt: "Resume workflow", // Placeholder - we'll skip script generation if it exists
      userId: user.id,
      runId: newRunId,
      lectureId: workflowRun.lectureId,
      imageDefaults: imageSettings,
      narrationDefaults: DEFAULT_NARRATION_GENERATION_DEFAULTS,
      context, // Pass the resume context
    } satisfies LectureCreationEventData & { context?: Record<string, unknown> },
  });

  return { newRunId };
}

/**
 * Get workflow status
 */
export async function getWorkflowStatusAction(runId: string) {
  const { user } = await getSession();

  const workflowRun = await getWorkflowRun(runId);

  if (!workflowRun) {
    throw new Error("Workflow run not found");
  }

  if (workflowRun.userId !== user.id) {
    throw new Error("Unauthorized");
  }

  return {
    status: workflowRun.status,
    currentStep: workflowRun.currentStep,
    totalSteps: workflowRun.totalSteps,
    completedSteps: (workflowRun.context?.completedSteps as number[]) || [],
  };
}
