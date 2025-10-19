import { describe, it, expect, vi } from "vitest";
import { generateLectureAudio, regenerateAudio } from "./audio-orchestrator";
import type {
  GenerateLectureAudioRequest,
  AudioGenerationContext,
  AudioOrchestratorDeps,
} from "./audio-orchestrator";
import { createLectureAssetStorage } from "@/services/lecture/storage";
import {
  createMockLectureScript,
  MockLogger,
  MockStorageHandler,
} from "@/services/media-generation/__test-utils__/mocks";

function buildAssetStorage(context: AudioGenerationContext, storage: MockStorageHandler) {
  return createLectureAssetStorage(
    {
      userId: context.userId,
      projectId: context.projectId,
      lectureId: context.lectureId,
    },
    { storageHandler: storage }
  );
}

describe("generateLectureAudio", () => {
  it("generates audio for all segments", async () => {
    const request: GenerateLectureAudioRequest = {
      script: createMockLectureScript(3),
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      runId: "test-run-audio-123",
    };

    const context: AudioGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 5,
      maxConcurrency: 5,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);

    // Mock audio generation - returns buffer + duration
    const mockGenerateAudios = vi.fn(async (requests) => {
      return requests.map(() => ({
        ok: true as const,
        audio: {
          buffer: Buffer.from("fake-audio"),
          duration: 5.5,
        },
      }));
    });

    const deps: AudioOrchestratorDeps = {
      generateAudios: mockGenerateAudios,
      assetStorage,
      logger: mockLogger,
    };

    const results = await generateLectureAudio(request, context, deps);

    expect(results).toHaveLength(3);
    expect(mockGenerateAudios).toHaveBeenCalledTimes(1);
    expect(mockStorage.savedFiles.size).toBe(3);

    expect(results[0]).toMatchObject({
      id: "narration-test-run-audio-123-0",
      label: "Segment 1",
      finalScript: "This is segment 1 narration text.",
      model: "aura-asteria-en",
      voice: "aura-asteria-en",
      duration: 5.5,
      sourceUrl: "user-1/42/5/narration/narration-test-run-audio-123-0.mp3",
      status: "generated",
    });
  });

  it("marks segments that need prompt updates when provider rejects content", async () => {
    const request: GenerateLectureAudioRequest = {
      script: createMockLectureScript(1),
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      runId: "test-run-audio-sensitive",
    };

    const context: AudioGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 6,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateAudios = vi.fn(async () => [
      {
        ok: false as const,
        error: {
          provider: "replicate",
          model: "aura-asteria-en",
          message: "Sensitive content",
          code: "SENSITIVE_CONTENT",
          providerCode: "E005",
          isRetryable: false,
          userActionRequired: true,
        },
      },
    ]);

    const results = await generateLectureAudio(request, context, {
      generateAudios: mockGenerateAudios,
      assetStorage,
    });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe("needs_prompt_update");
    expect(results[0].error).toMatchObject({
      code: "SENSITIVE_CONTENT",
      providerCode: "E005",
    });
    expect(mockStorage.savedFiles.size).toBe(0);
  });

  it("saves files to correct paths", async () => {
    const request: GenerateLectureAudioRequest = {
      script: createMockLectureScript(2),
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      runId: "test-run-audio-path",
    };

    const context: AudioGenerationContext = {
      userId: "user-456",
      projectId: 999,
      lectureId: 77,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateAudios = vi.fn(async () => [
      { ok: true, audio: { buffer: Buffer.from("audio-1"), duration: 5.0 } },
      { ok: true, audio: { buffer: Buffer.from("audio-2"), duration: 6.0 } },
    ]);

    const deps: AudioOrchestratorDeps = {
      generateAudios: mockGenerateAudios,
      assetStorage,
    };

    await generateLectureAudio(request, context, deps);

    const paths = mockStorage.getSavedPaths();
    expect(paths).toHaveLength(2);
    expect(paths[0]).toBe("user-456/999/77/narration/narration-test-run-audio-path-0.mp3");
    expect(paths[1]).toBe("user-456/999/77/narration/narration-test-run-audio-path-1.mp3");
  });

  it("calls logger at key points", async () => {
    const request: GenerateLectureAudioRequest = {
      script: createMockLectureScript(2),
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      runId: "test-run-audio-log",
    };

    const context: AudioGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 9,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateAudios = vi.fn(async () => [
      { ok: true, audio: { buffer: Buffer.from("audio"), duration: 5.0 } },
      { ok: true, audio: { buffer: Buffer.from("audio"), duration: 5.0 } },
    ]);

    const deps: AudioOrchestratorDeps = {
      generateAudios: mockGenerateAudios,
      assetStorage,
      logger: mockLogger,
    };

    await generateLectureAudio(request, context, deps);

    expect(mockLogger.findLog("Starting lecture audio generation")).toBe(true);
    expect(mockLogger.findLog("Lecture audio generation complete")).toBe(true);
  });

  it("respects maxConcurrency setting", async () => {
    const request: GenerateLectureAudioRequest = {
      script: createMockLectureScript(2),
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      runId: "test-run-audio-concurrency",
    };

    const context: AudioGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 13,
      maxConcurrency: 3,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateAudios = vi.fn(async (_requests, options) => {
      expect(options?.maxConcurrency).toBe(3);
      return [
        { ok: true, audio: { buffer: Buffer.from("audio"), duration: 5.0 } },
        { ok: true, audio: { buffer: Buffer.from("audio"), duration: 5.0 } },
      ];
    });

    const deps: AudioOrchestratorDeps = {
      generateAudios: mockGenerateAudios,
      assetStorage,
    };

    await generateLectureAudio(request, context, deps);

    expect(mockGenerateAudios).toHaveBeenCalled();
  });

  it("includes duration metadata in results", async () => {
    const request: GenerateLectureAudioRequest = {
      script: createMockLectureScript(2),
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      runId: "test-run-audio-duration",
    };

    const context: AudioGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 17,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateAudios = vi.fn(async () => [
      { ok: true, audio: { buffer: Buffer.from("audio-1"), duration: 7.5 } },
      { ok: true, audio: { buffer: Buffer.from("audio-2"), duration: 10.2 } },
    ]);

    const deps: AudioOrchestratorDeps = {
      generateAudios: mockGenerateAudios,
      assetStorage,
    };

    const results = await generateLectureAudio(request, context, deps);

    expect(results[0].duration).toBe(7.5);
    expect(results[1].duration).toBe(10.2);
  });
});

describe("regenerateAudio", () => {
  it("regenerates a single audio narration", async () => {
    const request = {
      text: "New updated narration text",
      voice: "aura-orpheus-en",
      model: "aura-orpheus-en",
      narrationId: "narration-regen-123",
    };

    const context: AudioGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 21,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateAudios = vi.fn(async () => {
      return [{ ok: true, audio: { buffer: Buffer.from("new-audio"), duration: 8.5 } }];
    });

    const deps: AudioOrchestratorDeps = {
      generateAudios: mockGenerateAudios,
      assetStorage,
      logger: mockLogger,
    };

    const result = await regenerateAudio(request, context, deps);

    expect(result).toMatchObject({
      id: "narration-regen-123",
      label: "Regenerated Narration",
      finalScript: "New updated narration text",
      model: "aura-orpheus-en",
      voice: "aura-orpheus-en",
      duration: 8.5,
      sourceUrl: "user-1/42/21/narration/narration-regen-123.mp3",
      status: "generated",
    });

    expect(mockGenerateAudios).toHaveBeenCalledTimes(1);
    expect(mockStorage.savedFiles.size).toBe(1);
  });

  it("saves to correct path", async () => {
    const request = {
      text: "Test narration",
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      narrationId: "narration-path-test",
    };

    const context: AudioGenerationContext = {
      userId: "user-789",
      projectId: 111,
      lectureId: 55,
    };

    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateAudios = vi.fn(async () => [
      { ok: true, audio: { buffer: Buffer.from("audio"), duration: 5.0 } },
    ]);

    const deps: AudioOrchestratorDeps = {
      generateAudios: mockGenerateAudios,
      assetStorage,
    };

    await regenerateAudio(request, context, deps);

    const paths = mockStorage.getSavedPaths();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("user-789/111/55/narration/narration-path-test.mp3");
  });

  it("logs regeneration activity", async () => {
    const request = {
      text: "Test narration text",
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      narrationId: "narration-log-test",
    };

    const context: AudioGenerationContext = {
      userId: "user-1",
      projectId: 42,
      lectureId: 34,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const assetStorage = buildAssetStorage(context, mockStorage);
    const mockGenerateAudios = vi.fn(async () => [
      { ok: true, audio: { buffer: Buffer.from("audio"), duration: 5.0 } },
    ]);

    const deps: AudioOrchestratorDeps = {
      generateAudios: mockGenerateAudios,
      assetStorage,
      logger: mockLogger,
    };

    await regenerateAudio(request, context, deps);

    expect(mockLogger.findLog("Regenerating audio")).toBe(true);
    expect(mockLogger.findLog("Audio regenerated and saved")).toBe(true);
  });
});
