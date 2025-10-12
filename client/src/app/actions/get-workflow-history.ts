"use server";

import { getSession } from "@/lib/session";
import { getRecentWorkflowRuns } from "@/data/workflow-runs";
import type { LectureProgressMessage, LectureRunStatus } from "@/inngest/functions/workflow-utils";
import { LECTURE_WORKFLOW_TOTAL_STEPS } from "@/inngest/functions/workflow-utils";

const STEP_NAMES = [
  "Starting lecture creation",
  "OpenAI response received",
  "Lecture script ready",
  "Images generated successfully",
  "Narration generated successfully",
  "Background music generated successfully",
  "Timeline created successfully",
];

export async function getWorkflowHistoryAction(lectureId: number, limit: number = 10) {
  const { user } = await getSession();

  const runs = await getRecentWorkflowRuns(user.id, lectureId, limit);

  // Transform workflow runs into synthetic progress messages
  const messages: Array<{ topic: string; data: LectureProgressMessage }> = [];

  for (const run of runs) {
    const { lecture, ...workflowRun } = run;
    const completedSteps = (workflowRun.context?.completedSteps as number[]) || [];
    const totalSteps = workflowRun.totalSteps || LECTURE_WORKFLOW_TOTAL_STEPS;

    // Add immediate feedback for queued runs
    if (workflowRun.status === "queued") {
      messages.push({
        topic: "progress",
        data: {
          type: "status",
          runId: workflowRun.runId,
          step: 0,
          totalSteps,
          status: "in-progress",
          message: "Queued for processing",
          timestamp: workflowRun.createdAt.toISOString(),
        },
      });
      // For queued runs, we only show the initial message
      continue;
    }

    // Add config message if lecture has config
    if (lecture.config) {
      messages.push({
        topic: "progress",
        data: {
          type: "config",
          runId: workflowRun.runId,
          config: lecture.config,
          timestamp: workflowRun.createdAt.toISOString(),
        },
      });
    }

    // Determine which steps are complete based on assets and completedSteps
    const stepStatus: Record<number, LectureRunStatus> = {};

    // Step 0: Configuration (always complete if we have a run)
    stepStatus[0] = "complete";

    // Step 1-2: Script generation
    if (lecture.script || completedSteps.includes(1)) {
      stepStatus[1] = "complete";
      stepStatus[2] = "complete";
    }

    // Step 3: Images
    if ((lecture.images && lecture.images.length > 0) || completedSteps.includes(3)) {
      stepStatus[3] = "complete";
    }

    // Step 4: Narration
    if ((lecture.narration && lecture.narration.length > 0) || completedSteps.includes(4)) {
      stepStatus[4] = "complete";
    }

    // Step 5: Music
    if ((lecture.music && lecture.music.length > 0) || completedSteps.includes(5)) {
      stepStatus[5] = "complete";
    }

    // Step 6: Timeline
    if (lecture.timeline || completedSteps.includes(6)) {
      stepStatus[6] = "complete";
    }

    // Generate status messages for each step
    for (let step = 0; step <= totalSteps; step++) {
      const status = stepStatus[step] || "pending";
      const message = STEP_NAMES[step] || `Step ${step}`;

      messages.push({
        topic: "progress",
        data: {
          type: "status",
          runId: workflowRun.runId,
          step,
          totalSteps,
          status,
          message,
          timestamp: workflowRun.updatedAt.toISOString(),
        },
      });
    }

    // Add result message if script exists
    if (lecture.script) {
      messages.push({
        topic: "progress",
        data: {
          type: "result",
          runId: workflowRun.runId,
          script: lecture.script,
          timestamp: workflowRun.updatedAt.toISOString(),
        },
      });
    }
  }

  return messages;
}
