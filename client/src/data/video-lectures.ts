import "server-only";

import { desc, eq } from "drizzle-orm";

import { db } from "@/db/db";
import {
  videoLecturesTable,
  type InsertVideoLecture,
  type SelectVideoLecture,
} from "@/db/app-schema";

type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const resolveDb = (database?: DbOrTx) => database ?? db;

type LectureContent = Partial<
  Omit<InsertVideoLecture, "id" | "projectId">
>;

export async function createVideoLecture(
  {
    projectId,
    ...content
  }: {
    projectId: number;
  } & LectureContent,
  database?: DbOrTx
): Promise<SelectVideoLecture> {
  const dbClient = resolveDb(database);

  const [videoLecture] = await dbClient
    .insert(videoLecturesTable)
    .values({
      projectId,
      script: content.script ?? null,
      images: content.images ?? null,
      narration: content.narration ?? null,
      music: content.music ?? null,
      effects: content.effects ?? null,
      timeline: content.timeline ?? null,
    })
    .returning();

  if (!videoLecture) {
    throw new Error("Failed to create video lecture");
  }

  return videoLecture;
}

export async function getLatestVideoLectureForProject(
  projectId: number,
  database?: DbOrTx
): Promise<SelectVideoLecture | null> {
  const dbClient = resolveDb(database);

  const [videoLecture] = await dbClient
    .select()
    .from(videoLecturesTable)
    .where(eq(videoLecturesTable.projectId, projectId))
    .orderBy(desc(videoLecturesTable.id))
    .limit(1);

  return videoLecture ?? null;
}
