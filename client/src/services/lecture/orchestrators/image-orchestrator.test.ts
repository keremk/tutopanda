import { describe, it, expect, vi } from "vitest";
import { generateLectureImages, regenerateImage } from "./image-orchestrator";
import type {
  GenerateLectureImagesRequest,
  ImageGenerationContext,
  ImageOrchestratorDeps,
} from "./image-orchestrator";
import { createLectureAssetStorage } from "@/services/lecture/storage";
import {
  createMockLectureScript,
  createMockImageConfig,
  MockLogger,
  MockStorageHandler,
} from "@/services/media-generation/__test-utils__/mocks";

function buildAssetStorage(context: ImageGenerationContext, storage: MockStorageHandler) {
  return createLectureAssetStorage(
    {
      userId: context.userId,
      projectId: context.projectId,
      lectureId: context.lectureId,
    },
    { storageHandler: storage }
  );
}

describe("generateLectureImages", () => {
  it("generates images for all segments", async () => {
    const request: GenerateLectureImagesRequest = {
      script: createMockLectureScript(3),
      config: createMockImageConfig(),
      runId: "test-run-123",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 7,
      maxConcurrency: 5,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);

    // Mock prompt generation
    const mockGeneratePrompts = vi.fn(async ({ segmentIndex }) => {
      return [`Prompt for segment ${segmentIndex + 1}`];
    });

    // Mock image generation
    const mockGenerateImages = vi.fn(async () => {
      return [
        { ok: true, buffer: Buffer.from("fake-image-1") },
        { ok: true, buffer: Buffer.from("fake-image-2") },
        { ok: true, buffer: Buffer.from("fake-image-3") },
      ];
    });

    const deps: ImageOrchestratorDeps = {
      generatePrompts: mockGeneratePrompts,
      generateImages: mockGenerateImages,
      assetStorage,
      logger: mockLogger,
    };

    const results = await generateLectureImages(request, context, deps);

    expect(results).toHaveLength(3);
    expect(mockGeneratePrompts).toHaveBeenCalledTimes(3);
    expect(mockGenerateImages).toHaveBeenCalledTimes(1);
    expect(mockStorage.savedFiles.size).toBe(3);
    expect(results.every((image) => image.status === "generated")).toBe(true);

    // Verify first result structure
    expect(results[0]).toMatchObject({
      id: "img-test-run-123-0-0",
      label: "Segment 1",
      prompt: "Prompt for segment 1",
      style: "Photorealistic",
      aspectRatio: "16:9",
      width: 1024,
      model: "bytedance/seedream-4",
      sourceUrl: "user-1/42/7/images/img-test-run-123-0-0.jpg",
      status: "generated",
    });

    const imageRequests = mockGenerateImages.mock.calls[0]?.[0];
    expect(Array.isArray(imageRequests)).toBe(true);
    expect(imageRequests?.[0]?.prompt).toContain("photorealistic cinematic shot");
  });

  it("handles multiple images per segment", async () => {
    const config = createMockImageConfig();
    config.imagesPerSegment = 2;

    const request: GenerateLectureImagesRequest = {
      script: createMockLectureScript(2),
      config,
      runId: "test-run-456",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 11,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGeneratePrompts = vi.fn(async ({ segmentIndex }) => {
      return [`Prompt ${segmentIndex + 1}-1`, `Prompt ${segmentIndex + 1}-2`];
    });

    const mockGenerateImages = vi.fn(async () => {
      return [
        { ok: true, buffer: Buffer.from("img-1") },
        { ok: true, buffer: Buffer.from("img-2") },
        { ok: true, buffer: Buffer.from("img-3") },
        { ok: true, buffer: Buffer.from("img-4") },
      ];
    });

    const deps: ImageOrchestratorDeps = {
      generatePrompts: mockGeneratePrompts,
      generateImages: mockGenerateImages,
      assetStorage,
    };

    const results = await generateLectureImages(request, context, deps);

    // 2 segments * 2 images = 4 total
    expect(results).toHaveLength(4);
    expect(mockGeneratePrompts).toHaveBeenCalledTimes(2);

    // Verify labels
    expect(results[0].label).toBe("Segment 1 Image 1");
    expect(results[1].label).toBe("Segment 1 Image 2");
    expect(results[2].label).toBe("Segment 2 Image 1");
    expect(results[3].label).toBe("Segment 2 Image 2");
    expect(results.every((image) => image.style === config.style)).toBe(true);
    expect(results.every((image) => image.status === "generated")).toBe(true);
  });

  it("saves files to correct paths", async () => {
    const request: GenerateLectureImagesRequest = {
      script: createMockLectureScript(2),
      config: createMockImageConfig(),
      runId: "test-run-789",
    };

    const context: ImageGenerationContext = {
      userId: "user-123",
      projectId: 999,
      lectureId: 456,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGeneratePrompts = vi.fn(async () => ["Prompt"]);
    const mockGenerateImages = vi.fn(async () => [
      { ok: true, buffer: Buffer.from("img-1") },
      { ok: true, buffer: Buffer.from("img-2") },
    ]);

    const deps: ImageOrchestratorDeps = {
      generatePrompts: mockGeneratePrompts,
      generateImages: mockGenerateImages,
      assetStorage,
    };

    await generateLectureImages(request, context, deps);

    const paths = mockStorage.getSavedPaths();
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe("user-123/999/456/images/img-test-run-789-0-0.jpg");
    expect(paths[1]).toBe("user-123/999/456/images/img-test-run-789-1-0.jpg");
  });

  it("calls logger at key points", async () => {
    const request: GenerateLectureImagesRequest = {
      script: createMockLectureScript(2),
      config: createMockImageConfig(),
      runId: "test-run-log",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 19,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGeneratePrompts = vi.fn(async () => ["Prompt"]);
    const mockGenerateImages = vi.fn(async () => [
      { ok: true, buffer: Buffer.from("img-1") },
      { ok: true, buffer: Buffer.from("img-2") },
    ]);

    const deps: ImageOrchestratorDeps = {
      generatePrompts: mockGeneratePrompts,
      generateImages: mockGenerateImages,
      assetStorage,
      logger: mockLogger,
    };

    await generateLectureImages(request, context, deps);

    expect(mockLogger.findLog("Starting lecture image generation")).toBe(true);
    expect(mockLogger.findLog("Prompts generated")).toBe(true);
    expect(mockLogger.findLog("Lecture image generation complete")).toBe(true);
  });

  it("respects maxConcurrency setting", async () => {
    const request: GenerateLectureImagesRequest = {
      script: createMockLectureScript(2),
      config: createMockImageConfig(),
      runId: "test-run-concurrency",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 23,
      maxConcurrency: 3,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGeneratePrompts = vi.fn(async () => ["Prompt"]);
    const mockGenerateImages = vi.fn(async (_requests, options) => {
      // Verify maxConcurrency is passed
      expect(options?.maxConcurrency).toBe(3);
      return [
        { ok: true, buffer: Buffer.from("img-1") },
        { ok: true, buffer: Buffer.from("img-2") },
      ];
    });

    const deps: ImageOrchestratorDeps = {
      generatePrompts: mockGeneratePrompts,
      generateImages: mockGenerateImages,
      assetStorage,
    };

    await generateLectureImages(request, context, deps);

    expect(mockGenerateImages).toHaveBeenCalled();
  });

  it("runs prompt generation with concurrency and reports progress", async () => {
    const request: GenerateLectureImagesRequest = {
      script: createMockLectureScript(3),
      config: createMockImageConfig(),
      runId: "test-run-prompt-concurrency",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 33,
      maxPromptConcurrency: 3,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const onPromptProgress = vi.fn();
    let activePrompts = 0;
    let peakConcurrency = 0;

    const mockGeneratePrompts = vi.fn(async ({ segmentIndex }) => {
      activePrompts += 1;
      peakConcurrency = Math.max(peakConcurrency, activePrompts);

      await new Promise((resolve) => setTimeout(resolve, 5 * (segmentIndex + 1)));

      activePrompts -= 1;
      return [`Prompt ${segmentIndex + 1}`];
    });

    const mockGenerateImages = vi.fn(async (requests) => {
      expect(requests).toHaveLength(3);
      return [
        { ok: true, buffer: Buffer.from("img-1") },
        { ok: true, buffer: Buffer.from("img-2") },
        { ok: true, buffer: Buffer.from("img-3") },
      ];
    });

    const deps: ImageOrchestratorDeps = {
      generatePrompts: mockGeneratePrompts,
      generateImages: mockGenerateImages,
      assetStorage,
      onPromptProgress,
    };

    await generateLectureImages(request, context, deps);

    expect(peakConcurrency).toBeGreaterThan(1);
    expect(onPromptProgress).toHaveBeenCalledTimes(3);
    expect(onPromptProgress).toHaveBeenNthCalledWith(1, 1, 3);
    expect(onPromptProgress).toHaveBeenNthCalledWith(2, 2, 3);
    expect(onPromptProgress).toHaveBeenNthCalledWith(3, 3, 3);
  });

  it("handles empty segments gracefully", async () => {
    const request: GenerateLectureImagesRequest = {
      script: createMockLectureScript(0), // 0 segments
      config: createMockImageConfig(),
      runId: "test-run-empty",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 101,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGeneratePrompts = vi.fn(async () => []);
    const mockGenerateImages = vi.fn(async () => []);

    const deps: ImageOrchestratorDeps = {
      generatePrompts: mockGeneratePrompts,
      generateImages: mockGenerateImages,
      assetStorage,
    };

    const results = await generateLectureImages(request, context, deps);

    expect(results).toHaveLength(0);
    expect(mockGeneratePrompts).not.toHaveBeenCalled();
  });

  it("marks image asset as needing prompt update on provider rejection", async () => {
    const request: GenerateLectureImagesRequest = {
      script: createMockLectureScript(1),
      config: createMockImageConfig(),
      runId: "test-run-sensitive",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 77,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGeneratePrompts = vi.fn(async () => ["Prompt"]);
    const mockGenerateImages = vi.fn(async () => [
      {
        ok: false as const,
        error: {
          provider: "replicate",
          model: "bytedance/seedream-4",
          message: "Sensitive content",
          code: "SENSITIVE_CONTENT",
          providerCode: "E005",
          isRetryable: false,
          userActionRequired: true,
        },
      },
    ]);

    const results = await generateLectureImages(request, context, {
      generatePrompts: mockGeneratePrompts,
      generateImages: mockGenerateImages,
      assetStorage,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("needs_prompt_update");
    expect(results[0].error).toMatchObject({ code: "SENSITIVE_CONTENT", providerCode: "E005" });
    expect(mockStorage.savedFiles.size).toBe(0);
  });
});

describe("regenerateImage", () => {
  it("regenerates a single image", async () => {
    const request = {
      basePrompt: "New updated prompt",
      style: "Anime",
      config: createMockImageConfig(),
      imageId: "img-regen-123",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 88,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateImages = vi.fn(async () => {
      return [{ ok: true, buffer: Buffer.from("new-image") }];
    });

    const deps: ImageOrchestratorDeps = {
      generateImages: mockGenerateImages,
      assetStorage,
      logger: mockLogger,
    };

    const result = await regenerateImage(request, context, deps);

    expect(result).toMatchObject({
      id: "img-regen-123",
      label: "Regenerated Image",
      prompt: "New updated prompt",
      style: "Anime",
      aspectRatio: "16:9",
      model: "bytedance/seedream-4",
      sourceUrl: "user-1/42/88/images/img-regen-123.jpg",
      status: "generated",
    });

    expect(mockGenerateImages).toHaveBeenCalledTimes(1);
    expect(mockStorage.savedFiles.size).toBe(1);

    const imageRequests = mockGenerateImages.mock.calls[0]?.[0];
    expect(imageRequests?.[0]?.prompt).toContain("modern anime illustration");
  });

  it("saves to correct path", async () => {
    const request = {
      basePrompt: "Test prompt",
      config: createMockImageConfig(),
      imageId: "img-path-test",
    };

    const context: ImageGenerationContext = {
      userId: "user-456",
      projectId: 789,
      lectureId: 222,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateImages = vi.fn(async () => [{ ok: true, buffer: Buffer.from("image") }]);

    const deps: ImageOrchestratorDeps = {
      generateImages: mockGenerateImages,
      assetStorage,
    };

    await regenerateImage(request, context, deps);

    const paths = mockStorage.getSavedPaths();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("user-456/789/222/images/img-path-test.jpg");
  });

  it("logs regeneration activity", async () => {
    const request = {
      basePrompt: "A very long prompt ".repeat(20),
      config: createMockImageConfig(),
      imageId: "img-log-test",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 303,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateImages = vi.fn(async () => [{ ok: true, buffer: Buffer.from("image") }]);

    const deps: ImageOrchestratorDeps = {
      generateImages: mockGenerateImages,
      assetStorage,
      logger: mockLogger,
    };

    await regenerateImage(request, context, deps);

    expect(mockLogger.findLog("Regenerating image")).toBe(true);
    expect(mockLogger.findLog("Image regenerated and saved")).toBe(true);
  });

  it("calculates dimensions correctly", async () => {
    const config = createMockImageConfig();
    config.aspectRatio = "4:3";
    config.width = 800;

    const request = {
      basePrompt: "Test",
      config,
      imageId: "img-dims-test",
    };

    const context: ImageGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 404,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateImages = vi.fn(async () => [{ ok: true, buffer: Buffer.from("image") }]);

    const deps: ImageOrchestratorDeps = {
      generateImages: mockGenerateImages,
      assetStorage,
    };

    const result = await regenerateImage(request, context, deps);

    expect(result.width).toBe(800);
    expect(result.height).toBe(600); // 800 * (3/4)
  });
});
