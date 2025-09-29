import { z } from "zod";

import { getLectureById, updateLectureSnapshot } from "@/data/video-lectures";
import { lectureContentSchema } from "@/types/types";

export const lectureUpdatePayloadSchema = lectureContentSchema.partial();

export type LectureUpdatePayload = z.infer<typeof lectureUpdatePayloadSchema>;

type BaseUpdateLectureContentInput = {
  lectureId: number;
  baseRevision?: number;
  payload: LectureUpdatePayload;
};

export type UpdateLectureContentInput = BaseUpdateLectureContentInput & {
  actorId: string;
};

export async function updateLectureContent({
  lectureId,
  payload,
  actorId,
  baseRevision,
}: UpdateLectureContentInput) {
  const current = await getLectureById({ lectureId });

  if (!current) {
    throw new Error(`Lecture ${lectureId} not found`);
  }

  const revisionToUse = baseRevision ?? current.revision;

  let attempt = await updateLectureSnapshot({
    lectureId,
    baseRevision: revisionToUse,
    actorId,
    source: "workflow",
    payload,
  });

  if (attempt.status === "conflict") {
    attempt = await updateLectureSnapshot({
      lectureId,
      baseRevision: attempt.snapshot.revision,
      actorId,
      source: "workflow",
      payload,
    });
  }

  if (attempt.status === "conflict") {
    throw new Error(`Failed to update lecture ${lectureId} due to concurrent changes`);
  }

  return attempt.snapshot;
}
