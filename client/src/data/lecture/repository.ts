import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db/db";
import {
  lectureRevisionsTable,
  projectsTable,
  videoLecturesTable,
} from "@/db/app-schema";
import type { DbLectureRevisionRow, DbVideoLectureRow } from "@/db/types";
import type {
  LectureContent,
  LectureRevision,
  LectureSnapshot,
  LectureSource,
  NormalisedLectureContent,
  TimelineTracks,
  Timeline,
} from "@/types/types";
import { lectureContentSchema } from "@/types/types";

type DbOrTx =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const resolveDb = (database?: DbOrTx) => database ?? db;

type InsertableLectureContent = Partial<LectureContent>;

export async function createVideoLecture(
  {
    projectId,
    ...content
  }: {
    projectId: number;
  } & InsertableLectureContent,
  database?: DbOrTx
): Promise<LectureSnapshot> {
  const dbClient = resolveDb(database);

  const [videoLecture] = await dbClient
    .insert(videoLecturesTable)
    .values({
      projectId,
      title: content.title ?? "Untitled Lecture",
      summary: content.summary ?? null,
      script: content.script ?? null,
      images: content.images ?? null,
      videos: content.videos ?? null,
      narration: content.narration ?? null,
      music: content.music ?? null,
      effects: content.effects ?? null,
      timeline: content.timeline ?? null,
    })
    .returning();

  if (!videoLecture) {
    throw new Error("Failed to create video lecture");
  }

  return parseLectureSnapshot(videoLecture);
}

export async function getLatestVideoLectureForProject(
  projectId: number,
  database?: DbOrTx
): Promise<LectureSnapshot | null> {
  const dbClient = resolveDb(database);

  const [videoLecture] = await dbClient
    .select()
    .from(videoLecturesTable)
    .where(eq(videoLecturesTable.projectId, projectId))
    .orderBy(desc(videoLecturesTable.id))
    .limit(1);

  return videoLecture ? parseLectureSnapshot(videoLecture) : null;
}

const emptyTracks = (): TimelineTracks => ({
  visual: [],
  voice: [],
  music: [],
  soundEffects: [],
});

const computeTimelineDuration = (tracks: TimelineTracks) => {
  const allDurations = Object.values(tracks).flatMap((clips) =>
    clips.map((clip) => clip.startTime + clip.duration)
  );

  return allDurations.length > 0 ? Math.max(...allDurations) : 0;
};

const normaliseLectureContent = (content: LectureContent): NormalisedLectureContent => {
  const rawTimeline = content.timeline ?? null;

  const tracks: TimelineTracks = rawTimeline
    ? {
        visual: rawTimeline.tracks.visual ?? [],
        voice: rawTimeline.tracks.voice ?? [],
        music: rawTimeline.tracks.music ?? [],
        soundEffects: rawTimeline.tracks.soundEffects ?? [],
      }
    : emptyTracks();

  const duration = computeTimelineDuration(tracks);

  const normalisedTimeline: Timeline = {
    id: rawTimeline?.id ?? "timeline",
    name: rawTimeline?.name ?? "Timeline",
    duration,
    tracks,
  };

  return {
    title: content.title,
    summary: content.summary,
    script: content.script ?? null,
    images: content.images ?? [],
    videos: content.videos ?? [],
    narration: content.narration ?? [],
    music: content.music ?? [],
    effects: content.effects ?? [],
    timeline: normalisedTimeline,
  } satisfies NormalisedLectureContent;
};

const parseLectureSnapshot = (lecture: DbVideoLectureRow): LectureSnapshot => {
  const parsed = lectureContentSchema.safeParse({
    title: lecture.title,
    summary: lecture.summary,
    script: lecture.script,
    images: lecture.images,
    videos: lecture.videos,
    narration: lecture.narration,
    music: lecture.music,
    effects: lecture.effects,
    timeline: lecture.timeline,
  });

  if (!parsed.success) {
    throw new Error(`Stored lecture content is invalid: ${parsed.error.message}`);
  }

  const content = normaliseLectureContent(parsed.data);

  return {
    id: lecture.id,
    projectId: lecture.projectId,
    title: parsed.data.title,
    summary: parsed.data.summary,
    script: content.script,
    images: content.images,
    videos: content.videos,
    narration: content.narration,
    music: content.music,
    effects: content.effects,
    timeline: content.timeline,
    revision: lecture.revision,
    updatedAt: lecture.updatedAt,
  } satisfies LectureSnapshot;
};

const parseLectureRevision = (revision: DbLectureRevisionRow): LectureRevision => {
  const parsed = lectureContentSchema.safeParse(revision.data);

  if (!parsed.success) {
    throw new Error(`Revision payload is invalid: ${parsed.error.message}`);
  }

  return {
    id: revision.id,
    lectureId: revision.lectureId,
    revision: revision.revision,
    data: normaliseLectureContent(parsed.data),
    createdBy: revision.createdBy,
    source: revision.source as LectureSource,
    runId: revision.runId,
    createdAt: revision.createdAt,
  } satisfies LectureRevision;
};

type GetLectureOptions = {
  lectureId: number;
  database?: DbOrTx;
};

export async function getLectureById({
  lectureId,
  database,
}: GetLectureOptions): Promise<LectureSnapshot | null> {
  const dbClient = resolveDb(database);
  const [lecture] = await dbClient
    .select()
    .from(videoLecturesTable)
    .where(eq(videoLecturesTable.id, lectureId))
    .limit(1);

  if (!lecture) {
    return null;
  }

  return parseLectureSnapshot(lecture);
}

export async function getLectureForUser({
  lectureId,
  userId,
  database,
}: {
  lectureId: number;
  userId: string;
  database?: DbOrTx;
}): Promise<LectureSnapshot | null> {
  const dbClient = resolveDb(database);

  const row = await dbClient
    .select({ lecture: videoLecturesTable })
    .from(videoLecturesTable)
    .innerJoin(
      projectsTable,
      eq(projectsTable.id, videoLecturesTable.projectId)
    )
    .where(
      and(
        eq(videoLecturesTable.id, lectureId),
        eq(projectsTable.createdBy, userId)
      )
    )
    .limit(1);

  const lecture = row[0]?.lecture;

  if (!lecture) {
    return null;
  }

  return parseLectureSnapshot(lecture);
}

export async function listVideoLecturesForUser(
  userId: string,
  database?: DbOrTx
): Promise<Array<{ id: number; title: string }>> {
  const dbClient = resolveDb(database);

  const rows = await dbClient
    .select({
      id: videoLecturesTable.id,
      title: videoLecturesTable.title,
    })
    .from(videoLecturesTable)
    .innerJoin(
      projectsTable,
      eq(projectsTable.id, videoLecturesTable.projectId)
    )
    .where(eq(projectsTable.createdBy, userId))
    .orderBy(desc(videoLecturesTable.id));

  return rows;
}

type UpdateLectureSnapshotInput = {
  lectureId: number;
  payload: Partial<LectureContent>;
  actorId: string;
  source?: LectureSource;
  baseRevision: number;
  runId?: string | null;
  database?: DbOrTx;
};

type UpdateLectureSnapshotResult =
  | { status: "updated"; snapshot: LectureSnapshot; revision: LectureRevision }
  | { status: "conflict"; snapshot: LectureSnapshot };

export async function updateLectureSnapshot({
  lectureId,
  payload,
  actorId,
  source = "app",
  baseRevision,
  runId = null,
  database,
}: UpdateLectureSnapshotInput): Promise<UpdateLectureSnapshotResult> {
  const dbClient = resolveDb(database);

  return dbClient.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(videoLecturesTable)
      .where(eq(videoLecturesTable.id, lectureId))
      .limit(1);

    if (!current) {
      throw new Error(`Lecture ${lectureId} does not exist`);
    }

    const currentSnapshot = parseLectureSnapshot(current);

    if (currentSnapshot.revision !== baseRevision) {
      return { status: "conflict", snapshot: currentSnapshot } as const;
    }

    const mergedContent = normaliseLectureContent({
      title: payload.title ?? currentSnapshot.title,
      summary: payload.summary ?? currentSnapshot.summary,
      script: payload.script ?? currentSnapshot.script,
      images: payload.images ?? currentSnapshot.images,
      videos: payload.videos ?? currentSnapshot.videos,
      narration: payload.narration ?? currentSnapshot.narration,
      music: payload.music ?? currentSnapshot.music,
      effects: payload.effects ?? currentSnapshot.effects,
      timeline: payload.timeline ?? currentSnapshot.timeline,
    });

    const nextRevision = currentSnapshot.revision + 1;

    const [updated] = await tx
      .update(videoLecturesTable)
      .set({
        title: payload.title ?? currentSnapshot.title,
        summary: payload.summary ?? currentSnapshot.summary,
        script: mergedContent.script,
        images: mergedContent.images,
        videos: mergedContent.videos,
        narration: mergedContent.narration,
        music: mergedContent.music,
        effects: mergedContent.effects,
        timeline: mergedContent.timeline,
        revision: nextRevision,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(videoLecturesTable.id, lectureId),
          eq(videoLecturesTable.revision, currentSnapshot.revision)
        )
      )
      .returning();

    if (!updated) {
      const [latest] = await tx
        .select()
        .from(videoLecturesTable)
        .where(eq(videoLecturesTable.id, lectureId))
        .limit(1);

      if (!latest) {
        throw new Error(`Lecture ${lectureId} disappeared during update`);
      }

      return { status: "conflict", snapshot: parseLectureSnapshot(latest) } as const;
    }

    const [revision] = await tx
      .insert(lectureRevisionsTable)
      .values({
        lectureId,
        revision: nextRevision,
        data: mergedContent,
        createdBy: actorId,
        source,
        runId,
      })
      .returning();

    if (!revision) {
      throw new Error("Failed to insert lecture revision");
    }

    const parsedRevision = parseLectureRevision(revision);
    const snapshot = parseLectureSnapshot({
      ...updated,
      title: payload.title ?? currentSnapshot.title,
      summary: payload.summary ?? currentSnapshot.summary,
      script: mergedContent.script,
      images: mergedContent.images,
      narration: mergedContent.narration,
      music: mergedContent.music,
      effects: mergedContent.effects,
      timeline: mergedContent.timeline,
    });

    return {
      status: "updated",
      snapshot,
      revision: parsedRevision,
    } as const;
  });
}

export const toSerializableLectureSnapshot = (snapshot: LectureSnapshot) => ({
  ...snapshot,
  updatedAt: snapshot.updatedAt.toISOString(),
});

export type SerializableLectureSnapshot = ReturnType<
  typeof toSerializableLectureSnapshot
>;
