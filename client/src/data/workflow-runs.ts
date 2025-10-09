import { eq } from "drizzle-orm";

import { workflowRunsTable } from "@/db/app-schema";
import { db } from "@/db/db";
import type { DbWorkflowRunRow } from "@/db/types";
import type { WorkflowRun, WorkflowStatus } from "@/types/types";

type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const resolveDb = (database?: DbOrTx) => database ?? db;

const normaliseContext = (
  context: unknown
): Record<string, unknown> | null => {
  if (context && typeof context === "object") {
    return context as Record<string, unknown>;
  }

  return null;
};

const toWorkflowRun = (row: DbWorkflowRunRow): WorkflowRun => ({
  runId: row.runId,
  lectureId: row.lectureId,
  userId: row.userId,
  status: row.status as WorkflowStatus,
  currentStep: row.currentStep,
  totalSteps: row.totalSteps,
  context: normaliseContext(row.context),
  updatedAt: row.updatedAt,
  createdAt: row.createdAt,
});

export async function createWorkflowRun(
  {
    runId,
    lectureId,
    userId,
    totalSteps = 0,
    status = "queued",
    currentStep = 0,
    context,
  }: {
    runId: string;
    lectureId: number;
    userId: string;
    totalSteps?: number;
    status?: WorkflowStatus;
    currentStep?: number;
    context?: Record<string, unknown>;
  },
  database?: DbOrTx
): Promise<WorkflowRun | null> {
  const dbClient = resolveDb(database);

  const [workflowRun] = await dbClient
    .insert(workflowRunsTable)
    .values({
      runId,
      lectureId,
      userId,
      totalSteps,
      status,
      currentStep,
      context,
    })
    .onConflictDoNothing()
    .returning();

  return workflowRun ? toWorkflowRun(workflowRun) : null;
}

export async function updateWorkflowRun(
  {
    runId,
    status,
    currentStep,
    totalSteps,
    context,
  }: {
    runId: string;
    status?: WorkflowStatus;
    currentStep?: number;
    totalSteps?: number;
    context?: Record<string, unknown>;
  },
  database?: DbOrTx
): Promise<WorkflowRun | null> {
  const dbClient = resolveDb(database);

  const updates: Partial<typeof workflowRunsTable.$inferInsert> = {};

  if (status) {
    updates.status = status;
  }

  if (typeof currentStep === "number") {
    updates.currentStep = currentStep;
  }

  if (typeof totalSteps === "number") {
    updates.totalSteps = totalSteps;
  }

  if (context) {
    updates.context = context;
  }

  if (Object.keys(updates).length === 0) {
    return null;
  }

  updates.updatedAt = new Date();

  const [workflowRun] = await dbClient
    .update(workflowRunsTable)
    .set(updates)
    .where(eq(workflowRunsTable.runId, runId))
    .returning();

  return workflowRun ? toWorkflowRun(workflowRun) : null;
}

export async function getWorkflowRun(
  runId: string,
  database?: DbOrTx
): Promise<WorkflowRun | null> {
  const dbClient = resolveDb(database);

  const [workflowRun] = await dbClient
    .select()
    .from(workflowRunsTable)
    .where(eq(workflowRunsTable.runId, runId))
    .limit(1);

  return workflowRun ? toWorkflowRun(workflowRun) : null;
}

export async function markStepComplete(
  runId: string,
  step: number,
  database?: DbOrTx
): Promise<WorkflowRun | null> {
  const run = await getWorkflowRun(runId, database);

  if (!run) {
    return null;
  }

  const completedSteps = (run.context?.completedSteps as number[]) || [];

  return updateWorkflowRun(
    {
      runId,
      currentStep: step,
      context: {
        ...run.context,
        completedSteps: [...new Set([...completedSteps, step])],
      },
    },
    database
  );
}
