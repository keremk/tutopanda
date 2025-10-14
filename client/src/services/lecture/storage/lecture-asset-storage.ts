import { setupFileStorage } from "@/lib/storage-utils";
import { FileStorageHandler } from "@/services/media-generation/core";
import type { StorageHandler } from "@/services/media-generation/core";

export type LectureAssetIdentifiers = {
  userId: string;
  projectId: number;
  lectureId: number;
};

export type LectureAssetCategory = "images" | "music" | "narration";

export type LectureAssetStorageOptions = {
  storageHandler?: StorageHandler;
};

export type LectureAssetStorage = {
  basePath: string;
  resolveAssetPath: (category: LectureAssetCategory, fileName: string) => string;
  saveAsset: (
    category: LectureAssetCategory,
    fileName: string,
    content: Buffer | Uint8Array | ReadableStream
  ) => Promise<string>;
  saveImage: (
    content: Buffer | Uint8Array | ReadableStream,
    imageId: string
  ) => Promise<string>;
  resolveImagePath: (imageId: string) => string;
  saveNarration: (
    content: Buffer | Uint8Array | ReadableStream,
    narrationId: string
  ) => Promise<string>;
  resolveNarrationPath: (narrationId: string) => string;
  saveMusic: (
    content: Buffer | Uint8Array | ReadableStream,
    musicId: string
  ) => Promise<string>;
  resolveMusicPath: (musicId: string) => string;
};

/**
 * Centralized helper for resolving lecture asset paths and persisting files via FlyStorage.
 * Ensures all generated assets share the user/project/lecture folder structure.
 */
export function createLectureAssetStorage(
  identifiers: LectureAssetIdentifiers,
  options: LectureAssetStorageOptions = {}
): LectureAssetStorage {
  const storageHandler =
    options.storageHandler ?? new FileStorageHandler(setupFileStorage());

  const basePath = `${identifiers.userId}/${identifiers.projectId}/${identifiers.lectureId}`;

  const resolveAssetPath = (
    category: LectureAssetCategory,
    fileName: string
  ) => `${basePath}/${category}/${fileName}`;

  const saveAsset = async (
    category: LectureAssetCategory,
    fileName: string,
    content: Buffer | Uint8Array | ReadableStream
  ): Promise<string> => {
    const path = resolveAssetPath(category, fileName);
    await storageHandler.saveFile(content, path);
    return path;
  };

  const saveImage = (
    content: Buffer | Uint8Array | ReadableStream,
    imageId: string
  ) => saveAsset("images", `${imageId}.jpg`, content);

  const resolveImagePath = (imageId: string) => resolveAssetPath("images", `${imageId}.jpg`);

  const saveNarration = (
    content: Buffer | Uint8Array | ReadableStream,
    narrationId: string
  ) => saveAsset("narration", `${narrationId}.mp3`, content);

  const resolveNarrationPath = (narrationId: string) =>
    resolveAssetPath("narration", `${narrationId}.mp3`);

  const saveMusic = (
    content: Buffer | Uint8Array | ReadableStream,
    musicId: string
  ) => saveAsset("music", `${musicId}.mp3`, content);

  const resolveMusicPath = (musicId: string) => resolveAssetPath("music", `${musicId}.mp3`);

  return {
    basePath,
    resolveAssetPath,
    saveAsset,
    saveImage,
    resolveImagePath,
    saveNarration,
    resolveNarrationPath,
    saveMusic,
    resolveMusicPath,
  };
}
