import { z } from "zod";
import { lectureUpdatePayloadSchema } from "@/services/lecture/persist";
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

export { updateLectureContentActionSchema };
