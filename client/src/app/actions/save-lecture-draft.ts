"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  toSerializableLectureSnapshot,
  updateLectureSnapshot,
} from "@/data/video-lectures";
import { lectureContentSchema } from "@/types/types";
import { getSession } from "@/lib/session";

const payloadSchema = lectureContentSchema.partial();

const saveLectureDraftSchema = z.object({
  lectureId: z.number().int().positive(),
  baseRevision: z.number().int().nonnegative(),
  payload: payloadSchema.refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update.",
  }),
});

export type SaveLectureDraftInput = z.infer<typeof saveLectureDraftSchema>;

export type SaveLectureDraftResult =
  | {
      status: "updated";
      revision: number;
      updatedAt: string;
      snapshot: ReturnType<typeof toSerializableLectureSnapshot>;
    }
  | {
      status: "conflict";
      snapshot: ReturnType<typeof toSerializableLectureSnapshot>;
    };

export async function saveLectureDraftAction(
  input: SaveLectureDraftInput
): Promise<SaveLectureDraftResult> {
  const parsed = saveLectureDraftSchema.parse(input);
  const { user } = await getSession();

  const result = await updateLectureSnapshot({
    lectureId: parsed.lectureId,
    payload: parsed.payload,
    actorId: user.id,
    source: "app",
    baseRevision: parsed.baseRevision,
  });

  if (result.status === "conflict") {
    return {
      status: "conflict",
      snapshot: toSerializableLectureSnapshot(result.snapshot),
    };
  }

  await revalidatePath(`/edit/${parsed.lectureId}`);

  return {
    status: "updated",
    revision: result.snapshot.revision,
    updatedAt: result.snapshot.updatedAt.toISOString(),
    snapshot: toSerializableLectureSnapshot(result.snapshot),
  };
}
