"use server";

import { getSession } from "@/lib/session";
import { updateLectureContent } from "@/services/lecture/persist";
import { toSerializableLectureSnapshot } from "@/data/lecture/repository";
import {
  type UpdateLectureContentActionInput,
  updateLectureContentActionSchema,
} from "./types";

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
