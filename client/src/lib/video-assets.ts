import { buildAssetUrl } from "@/lib/asset-url";
import type { VideoAsset } from "@/types/types";

const API_PREFIX = "/api/storage/";

const stripQuery = (path: string) => path.split("?")[0];

const ensureRelative = (path: string) => stripQuery(path).replace(/^\/+/g, "");

const deriveBasePath = (video: VideoAsset): string | undefined => {
  const videoPath = video.videoPath;
  if (videoPath) {
    const relative = ensureRelative(videoPath);
    const marker = "/videos/";
    const idx = relative.lastIndexOf(marker);

    if (idx != -1) {
      return relative.slice(0, idx);
    }
  }

  const legacy = (video as unknown as { startingImageUrl?: string }).startingImageUrl;
  if (legacy) {
    const relative = ensureRelative(legacy);
    const marker = "/images/";
    const idx = relative.lastIndexOf(marker);
    if (idx != -1) {
      return relative.slice(0, idx);
    }
  }

  return undefined;
};

type BuildVideoAssetUrlOptions = {
  updatedAt?: Date;
  previewToken?: number | null;
  cacheKey?: number;
};

export const buildVideoAssetUrl = (
  video: VideoAsset,
  options: BuildVideoAssetUrlOptions = {}
): string | undefined => {
  const basePath = deriveBasePath(video);
  if (!basePath) {
    return undefined;
  }

  const relativePath = `${basePath}/videos/${video.id}.mp4`;
  const url = `${API_PREFIX}${relativePath}`;

  let finalUrl = buildAssetUrl({
    url,
    updatedAt: options.updatedAt,
    previewToken: options.previewToken ?? null,
  });

  if (options.cacheKey) {
    const separator = finalUrl.includes("?") ? "&" : "?";
    finalUrl = `${finalUrl}${separator}v=${options.cacheKey}`;
  }

  return finalUrl;
};

export const buildStartingImageUrl = (
  video: VideoAsset,
  options: BuildVideoAssetUrlOptions = {}
): string | undefined => {
  const basePath = deriveBasePath(video);
  if (!basePath || !video.startingImageId) {
    return undefined;
  }

  const relativePath = `${basePath}/images/${video.startingImageId}.jpg`;
  const url = `${API_PREFIX}${relativePath}`;

  let finalUrl = buildAssetUrl({
    url,
    updatedAt: options.updatedAt,
    previewToken: options.previewToken ?? null,
  });

  if (options.cacheKey) {
    const separator = finalUrl.includes("?") ? "&" : "?";
    finalUrl = `${finalUrl}${separator}v=${options.cacheKey}`;
  }

  return finalUrl;
};
