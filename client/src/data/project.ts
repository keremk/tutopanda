import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { projectsTable, type SelectProject } from "@/db/app-schema";
import { getLatestVideoLectureForProject } from "@/data/video-lectures";

type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const resolveDb = (database?: DbOrTx) => database ?? db;

export async function listProjectsForUser(
  userId: string,
  database?: DbOrTx
): Promise<SelectProject[]> {
  const dbClient = resolveDb(database);

  return dbClient
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.createdBy, userId))
    .orderBy(desc(projectsTable.id));
}

export async function createProject(
  {
    userId,
    name,
  }: {
    userId: string;
    name?: string | null;
  },
  database?: DbOrTx
): Promise<SelectProject> {
  const dbClient = resolveDb(database);

  const [project] = await dbClient
    .insert(projectsTable)
    .values({
      createdBy: userId,
      name: name ?? null,
    })
    .returning();

  if (!project) {
    throw new Error("Failed to create project");
  }

  return project;
}

export async function getProjectById(
  projectId: number,
  userId: string,
  database?: DbOrTx
): Promise<SelectProject | null> {
  const dbClient = resolveDb(database);

  const [project] = await dbClient
    .select()
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.id, projectId),
        eq(projectsTable.createdBy, userId)
      )
    )
    .limit(1);

  return project ?? null;
}

export async function listProjectsWithLatestLecture(
  userId: string,
  database?: DbOrTx
): Promise<Array<{ project: SelectProject; latestLectureId: number | null }>> {
  const projects = await listProjectsForUser(userId, database);

  const results = await Promise.all(
    projects.map(async (project) => {
      const lecture = await getLatestVideoLectureForProject(project.id, database);

      return {
        project,
        latestLectureId: lecture?.id ?? null,
      };
    })
  );

  return results;
}
