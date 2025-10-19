import { describe, it, expect, vi } from "vitest";
import {
  generateVideoStartingImages,
  generateVideoAssets,
  type VideoSegmentPrompt,
  type VideoSegmentImageResult,
} from "./video-orchestrator";
import type { VideoGenerationContext } from "./video-orchestrator";
import { createLectureAssetStorage } from "@/services/lecture/storage";
import { MockLogger, MockStorageHandler } from "@/services/media-generation/__test-utils__/mocks";
import { createMediaGenerationError } from "@/services/media-generation/core";
import { DEFAULT_IMAGE_GENERATION_DEFAULTS } from "@/types/types";

function buildAssetStorage(context: VideoGenerationContext, storage: MockStorageHandler) {
  return createLectureAssetStorage(
    {
      userId: context.userId,
      projectId: context.projectId,
      lectureId: context.lectureId,
    },
    { storageHandler: storage }
  );
}

describe("video orchestrator helpers", () => {
  const baseContext: VideoGenerationContext = {
    userId: "user-1",
    projectId: 42,
    lectureId: 7,
  };

  describe("generateVideoStartingImages", () => {
    it("returns successful results when image generation succeeds", async () => {
      const segmentPrompts: VideoSegmentPrompt[] = [
        {
          segmentIndex: 0,
          segmentStartImagePrompt: "base",
          movieDirections: "dirs",
          styledImagePrompt: "styled",
          styledMovieDirections: "styledDirs",
        },
      ];

      const storage = new MockStorageHandler();
      const assetStorage = buildAssetStorage(baseContext, storage);

      const results = await generateVideoStartingImages(segmentPrompts, {
        imageConfig: DEFAULT_IMAGE_GENERATION_DEFAULTS,
        runId: "run-123",
        assetStorage,
        generateImageFn: vi.fn(async () => Buffer.from("image")),
      });

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.imageId).toBe("video-img-run-123-0");
      }
    });

    it("returns failure metadata when provider rejects the prompt", async () => {
      const segmentPrompts: VideoSegmentPrompt[] = [
        {
          segmentIndex: 0,
          segmentStartImagePrompt: "base",
          movieDirections: "dirs",
          styledImagePrompt: "styled",
          styledMovieDirections: "styledDirs",
        },
      ];

      const storage = new MockStorageHandler();
      const assetStorage = buildAssetStorage(baseContext, storage);
      const error = createMediaGenerationError({
        code: "SENSITIVE_CONTENT",
        provider: "replicate",
        model: "bytedance/seedream-4",
        message: "Sensitive content",
        isRetryable: false,
        userActionRequired: true,
      });

      const results = await generateVideoStartingImages(segmentPrompts, {
        imageConfig: DEFAULT_IMAGE_GENERATION_DEFAULTS,
        runId: "run-123",
        assetStorage,
        generateImageFn: vi.fn(async () => {
          throw error;
        }),
      });

      expect(results).toHaveLength(1);
      const result = results[0];
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe("SENSITIVE_CONTENT");
        expect(result.error.userActionRequired).toBe(true);
      }
    });
  });

  describe("generateVideoAssets", () => {
    const segmentPrompts: VideoSegmentPrompt[] = [
      {
        segmentIndex: 0,
        segmentStartImagePrompt: "image",
        movieDirections: "dir",
        styledImagePrompt: "styledImage",
        styledMovieDirections: "styledDir",
      },
    ];

    it("saves video and marks status generated when all dependencies succeed", async () => {
      const storage = new MockStorageHandler();
      const assetStorage = buildAssetStorage(baseContext, storage);
      const segmentImages: VideoSegmentImageResult[] = [
        { segmentIndex: 0, imageId: "video-img-run-123-0", ok: true },
      ];

      const results = await generateVideoAssets(segmentPrompts, segmentImages, {
        videoConfig: {
          duration: "10",
          resolution: "480p",
          model: "video-model",
        },
        imageConfig: DEFAULT_IMAGE_GENERATION_DEFAULTS,
        runId: "run-123",
        assetStorage,
        logger: new MockLogger(),
        generateVideoFn: vi.fn(async () => Buffer.from("video")),
        loadImageFn: vi.fn(async () => Buffer.from("image")),
      });

      expect(results).toHaveLength(1);
      const asset = results[0];
      expect(asset.status).toBe("generated");
      expect(asset.videoPath).toBe("user-1/42/7/videos/video-run-123-0.mp4");
    });

    it("marks asset as needing prompt update when starting image failed", async () => {
      const storage = new MockStorageHandler();
      const assetStorage = buildAssetStorage(baseContext, storage);
      const failingImage: VideoSegmentImageResult = {
        segmentIndex: 0,
        ok: false,
        error: createMediaGenerationError({
          code: "SENSITIVE_CONTENT",
          provider: "replicate",
          model: "image-model",
          message: "Sensitive content",
          isRetryable: false,
          userActionRequired: true,
        }),
      };

      const results = await generateVideoAssets(segmentPrompts, [failingImage], {
        videoConfig: {
          duration: "10",
          resolution: "480p",
        },
        imageConfig: DEFAULT_IMAGE_GENERATION_DEFAULTS,
        runId: "run-123",
        assetStorage,
        logger: new MockLogger(),
        generateVideoFn: vi.fn(async () => Buffer.from("video")),
        loadImageFn: vi.fn(async () => Buffer.from("image")),
      });

      expect(results).toHaveLength(1);
      const asset = results[0];
      expect(asset.status).toBe("needs_prompt_update");
      expect(asset.error?.code).toBe("SENSITIVE_CONTENT");
      expect(asset.videoPath).toBeUndefined();
    });

    it("marks asset as failed when video generation throws", async () => {
      const storage = new MockStorageHandler();
      const assetStorage = buildAssetStorage(baseContext, storage);
      const segmentImages: VideoSegmentImageResult[] = [
        { segmentIndex: 0, imageId: "video-img-run-123-0", ok: true },
      ];

      const videoError = createMediaGenerationError({
        code: "PROVIDER_FAILURE",
        provider: "video-provider",
        model: "video-model",
        message: "Provider failure",
        isRetryable: false,
        userActionRequired: false,
      });

      const results = await generateVideoAssets(segmentPrompts, segmentImages, {
        videoConfig: {
          duration: "10",
          resolution: "480p",
        },
        imageConfig: DEFAULT_IMAGE_GENERATION_DEFAULTS,
        runId: "run-123",
        assetStorage,
        logger: new MockLogger(),
        generateVideoFn: vi.fn(async () => {
          throw videoError;
        }),
        loadImageFn: vi.fn(async () => Buffer.from("image")),
      });

      expect(results).toHaveLength(1);
      const asset = results[0];
      expect(asset.status).toBe("failed");
      expect(asset.error?.code).toBe("PROVIDER_FAILURE");
      expect(asset.videoPath).toBeUndefined();
    });
  });
});
