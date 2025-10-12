import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/db";
import { projectsTable, type SelectProject } from "@/db/app-schema";
import { getLatestVideoLectureForProject } from "@/data/lecture/repository";
import { DEFAULT_LECTURE_CONFIG, type LectureConfig } from "@/types/types";

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

export async function getOrCreateDefaultProject(
  userId: string,
  database?: DbOrTx
): Promise<SelectProject> {
  const dbClient = resolveDb(database);

  // Try to find existing default project
  const [existingDefault] = await dbClient
    .select()
    .from(projectsTable)
    .where(
      and(
        eq(projectsTable.createdBy, userId),
        eq(projectsTable.isDefault, true)
      )
    )
    .limit(1);

  if (existingDefault) {
    return existingDefault;
  }

  // Create default project if none exists
  const [newDefault] = await dbClient
    .insert(projectsTable)
    .values({
      createdBy: userId,
      name: "My Lectures",
      isDefault: true,
      settings: DEFAULT_LECTURE_CONFIG,
    })
    .returning();

  if (!newDefault) {
    throw new Error("Failed to create default project");
  }

  return newDefault;
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

export async function getProjectSettings(
  userId: string,
  database?: DbOrTx
): Promise<LectureConfig> {
  const project = await getOrCreateDefaultProject(userId, database);

  // Return settings if they exist, otherwise return default config
  if (project.settings) {
    const settings = project.settings as LectureConfig;
    // Migrate old configs that don't have research section
    return {
      ...settings,
      research: settings.research ?? DEFAULT_LECTURE_CONFIG.research,
    };
  }

  return DEFAULT_LECTURE_CONFIG;
}

export async function updateProjectSettings(
  userId: string,
  settings: LectureConfig,
  database?: DbOrTx
): Promise<SelectProject> {
  const dbClient = resolveDb(database);

  // Get the default project
  const project = await getOrCreateDefaultProject(userId, database);

  // Update settings
  const [updated] = await dbClient
    .update(projectsTable)
    .set({ settings })
    .where(eq(projectsTable.id, project.id))
    .returning();

  if (!updated) {
    throw new Error("Failed to update project settings");
  }

  return updated;
}
