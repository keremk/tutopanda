"use server";

import { z } from "zod";

import { getSession } from "@/lib/session";
import {
  lectureUpdatePayloadSchema,
  updateLectureContent,
  type LectureUpdatePayload,
} from "@/services/lecture/persist";
import { toSerializableLectureSnapshot } from "@/data/lecture/repository";

const updateLectureContentActionSchema = z.object({
  lectureId: z.number().int().positive(),
  baseRevision: z.number().int().nonnegative().optional(),
  payload: lectureUpdatePayloadSchema.refine(
    (value) => Object.keys(value).length > 0,
    {
      message: "Provide at least one field to update.",
    }
  ),
});

export type UpdateLectureContentActionInput = z.infer<
  typeof updateLectureContentActionSchema
>;

export type SerializedLectureSnapshot = ReturnType<
  typeof toSerializableLectureSnapshot
>;

export async function updateLectureContentAction({
  lectureId,
  baseRevision,
  payload,
}: UpdateLectureContentActionInput) {
  const parsed = updateLectureContentActionSchema.parse({
    lectureId,
    baseRevision,
    payload,
  });

  const { user } = await getSession();

  const snapshot = await updateLectureContent({
    lectureId: parsed.lectureId,
    payload: parsed.payload,
    actorId: user.id,
    baseRevision: parsed.baseRevision,
  });

  return toSerializableLectureSnapshot(snapshot);
}

export type { LectureUpdatePayload } from "@/services/lecture/persist";
