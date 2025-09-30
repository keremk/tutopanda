"use server";

import { getSession } from "@/lib/session";
import { getLectureForUser, toSerializableLectureSnapshot } from "@/data/lecture/repository";

export async function getLectureAction(lectureId: number) {
  const { user } = await getSession();

  const lecture = await getLectureForUser({
    lectureId,
    userId: user.id,
  });

  if (!lecture) {
    throw new Error(`Lecture ${lectureId} not found`);
  }

  return toSerializableLectureSnapshot(lecture);
}