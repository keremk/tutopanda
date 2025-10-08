"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { setupFileStorage } from "@/lib/storage-utils";
import { FileStorageHandler } from "@/services/media-generation/core";
import {
  regenerateImage,
  regenerateAudio,
  regenerateMusic,
} from "@/services/lecture/orchestrators";
import type { ImageAsset, NarrationSettings, MusicSettings, ImageGenerationDefaults } from "@/types/types";
import { updateLectureContent } from "@/services/lecture/persist";

/**
 * Server Action to regenerate a single image.
 * Called from UI when user clicks "Regenerate Image" button.
 */
export async function regenerateImageAction(input: {
  lectureId: number;
  projectId: number;
  imageId: string;
  prompt: string;
  config: ImageGenerationDefaults;
}): Promise<ImageAsset> {
  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: new Headers(headerStore),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;
  const { lectureId, projectId, imageId, prompt, config } = input;

  const storage = setupFileStorage();
  const storageHandler = new FileStorageHandler(storage);

  const imageAsset = await regenerateImage(
    {
      prompt,
      config,
      imageId,
    },
    {
      userId,
      projectId,
    },
    {
      saveFile: async (buffer, path) => {
        await storageHandler.saveFile(buffer, path);
      },
    }
  );

  // Update lecture content with new image
  await updateLectureContent({
    lectureId,
    actorId: userId,
    payload: {
      images: [imageAsset],
    },
  });

  return imageAsset;
}

/**
 * Server Action to regenerate a single audio narration.
 * Called from UI when user clicks "Regenerate Narration" button.
 */
export async function regenerateAudioAction(input: {
  lectureId: number;
  projectId: number;
  narrationId: string;
  text: string;
  voice: string;
  model: string;
}): Promise<NarrationSettings> {
  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: new Headers(headerStore),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;
  const { lectureId, projectId, narrationId, text, voice, model } = input;

  const storage = setupFileStorage();
  const storageHandler = new FileStorageHandler(storage);

  const narrationAsset = await regenerateAudio(
    {
      text,
      voice,
      model,
      narrationId,
    },
    {
      userId,
      projectId,
    },
    {
      saveFile: async (buffer, path) => {
        await storageHandler.saveFile(buffer, path);
      },
    }
  );

  // Update lecture content with new narration
  await updateLectureContent({
    lectureId,
    actorId: userId,
    payload: {
      narration: [narrationAsset],
    },
  });

  return narrationAsset;
}

/**
 * Server Action to regenerate lecture music.
 * Called from UI when user clicks "Regenerate Music" button.
 */
export async function regenerateMusicAction(input: {
  lectureId: number;
  projectId: number;
  musicId: string;
  prompt: string;
  durationSeconds: number;
  model?: string;
}): Promise<MusicSettings> {
  const headerStore = await headers();
  const session = await auth.api.getSession({
    headers: new Headers(headerStore),
  });

  if (!session?.user?.id) {
    throw new Error("Unauthorized");
  }

  const userId = session.user.id;
  const { lectureId, projectId, musicId, prompt, durationSeconds, model } = input;

  const storage = setupFileStorage();
  const storageHandler = new FileStorageHandler(storage);

  const musicAsset = await regenerateMusic(
    {
      prompt,
      durationSeconds,
      model,
      musicId,
    },
    {
      userId,
      projectId,
    },
    {
      saveFile: async (buffer, path) => {
        await storageHandler.saveFile(buffer, path);
      },
    }
  );

  // Update lecture content with new music
  await updateLectureContent({
    lectureId,
    actorId: userId,
    payload: {
      music: [musicAsset],
    },
  });

  return musicAsset;
}
