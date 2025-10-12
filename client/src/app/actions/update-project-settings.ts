"use server";

import { revalidatePath } from "next/cache";

import { updateProjectSettings } from "@/data/project";
import { getSession } from "@/lib/session";
import type { LectureConfig } from "@/types/types";

type UpdateProjectSettingsInput = {
  settings: LectureConfig;
};

export async function updateProjectSettingsAction({
  settings,
}: UpdateProjectSettingsInput) {
  const { user } = await getSession();

  await updateProjectSettings(user.id, settings);

  revalidatePath("/settings");
  revalidatePath("/create");

  return { success: true };
}
