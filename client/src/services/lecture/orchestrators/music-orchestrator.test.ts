import { describe, it, expect, vi } from "vitest";
import { generateLectureMusic, regenerateMusic } from "./music-orchestrator";
import type { GenerateLectureMusicRequest, MusicGenerationContext, MusicOrchestratorDeps } from "./music-orchestrator";
import { createMockLectureScript, MockLogger, MockStorageHandler } from "@/services/media-generation/__test-utils__/mocks";

describe("generateLectureMusic", () => {
  it("generates music for a lecture", async () => {
    const request: GenerateLectureMusicRequest = {
      script: createMockLectureScript(3),
      durationSeconds: 60,
      model: "stability-ai/stable-audio-2.5",
      runId: "test-run-music-123",
    };

    const context: MusicGenerationContext = {
      userId: "user-1",
      projectId: 42,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();

    // Mock prompt generation
    const mockGeneratePrompt = vi.fn(async () => {
      return "Upbeat background music with piano";
    });

    // Mock music generation
    const mockGenerateMusics = vi.fn(async () => {
      return [Buffer.from("fake-music-data")];
    });

    const deps: MusicOrchestratorDeps = {
      generatePrompt: mockGeneratePrompt,
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
      logger: mockLogger,
    };

    const result = await generateLectureMusic(request, context, deps);

    expect(result).toMatchObject({
      id: "music-test-run-music-123",
      label: "Background Score",
      prompt: "Upbeat background music with piano",
      duration: 60,
      audioUrl: "user-1/42/musical-score/music-test-run-music-123.mp3",
    });

    expect(mockGeneratePrompt).toHaveBeenCalledTimes(1);
    expect(mockGenerateMusics).toHaveBeenCalledTimes(1);
    expect(mockStorage.savedFiles.size).toBe(1);
  });

  it("saves file to correct path", async () => {
    const request: GenerateLectureMusicRequest = {
      script: createMockLectureScript(2),
      durationSeconds: 45,
      runId: "test-run-music-path",
    };

    const context: MusicGenerationContext = {
      userId: "user-789",
      projectId: 999,
    };

    const mockStorage = new MockStorageHandler();
    const mockGeneratePrompt = vi.fn(async () => "Test prompt");
    const mockGenerateMusics = vi.fn(async () => [Buffer.from("music")]);

    const deps: MusicOrchestratorDeps = {
      generatePrompt: mockGeneratePrompt,
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
    };

    await generateLectureMusic(request, context, deps);

    const paths = mockStorage.getSavedPaths();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("user-789/999/musical-score/music-test-run-music-path.mp3");
  });

  it("calls logger at key points", async () => {
    const request: GenerateLectureMusicRequest = {
      script: createMockLectureScript(2),
      durationSeconds: 30,
      runId: "test-run-music-log",
    };

    const context: MusicGenerationContext = {
      userId: "user-1",
      projectId: 42,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const mockGeneratePrompt = vi.fn(async () => "Test prompt");
    const mockGenerateMusics = vi.fn(async () => [Buffer.from("music")]);

    const deps: MusicOrchestratorDeps = {
      generatePrompt: mockGeneratePrompt,
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
      logger: mockLogger,
    };

    await generateLectureMusic(request, context, deps);

    expect(mockLogger.findLog("Starting lecture music generation")).toBe(true);
    expect(mockLogger.findLog("Music prompt generated")).toBe(true);
    expect(mockLogger.findLog("Lecture music generation complete")).toBe(true);
  });

  it("uses default model when not specified", async () => {
    const request: GenerateLectureMusicRequest = {
      script: createMockLectureScript(2),
      durationSeconds: 30,
      runId: "test-run-music-default",
    };

    const context: MusicGenerationContext = {
      userId: "user-1",
      projectId: 42,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const mockGeneratePrompt = vi.fn(async () => "Test prompt");
    const mockGenerateMusics = vi.fn(async () => [Buffer.from("music")]);

    const deps: MusicOrchestratorDeps = {
      generatePrompt: mockGeneratePrompt,
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
      logger: mockLogger,
    };

    await generateLectureMusic(request, context, deps);

    // Check logger for default model
    expect(
      mockLogger.logs.some((log) => {
        const context = log.context as { model?: string } | undefined;
        return context?.model === "stability-ai/stable-audio-2.5";
      })
    ).toBe(true);
  });

  it("passes script and duration to prompt generator", async () => {
    const script = createMockLectureScript(3);
    const request: GenerateLectureMusicRequest = {
      script,
      durationSeconds: 90,
      runId: "test-run-music-prompt",
    };

    const context: MusicGenerationContext = {
      userId: "user-1",
      projectId: 42,
    };

    const mockStorage = new MockStorageHandler();
    const mockGeneratePrompt = vi.fn(async (receivedScript, receivedDuration) => {
      expect(receivedScript).toBe(script);
      expect(receivedDuration).toBe(90);
      return "Generated prompt";
    });
    const mockGenerateMusics = vi.fn(async () => [Buffer.from("music")]);

    const deps: MusicOrchestratorDeps = {
      generatePrompt: mockGeneratePrompt,
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
    };

    await generateLectureMusic(request, context, deps);

    expect(mockGeneratePrompt).toHaveBeenCalled();
  });
});

describe("regenerateMusic", () => {
  it("regenerates music from prompt", async () => {
    const request = {
      prompt: "New orchestral music with strings",
      durationSeconds: 45,
      model: "stability-ai/stable-audio-2.5",
      musicId: "music-regen-123",
    };

    const context: MusicGenerationContext = {
      userId: "user-1",
      projectId: 42,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const mockGenerateMusics = vi.fn(async () => {
      return [Buffer.from("new-music")];
    });

    const deps: MusicOrchestratorDeps = {
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
      logger: mockLogger,
    };

    const result = await regenerateMusic(request, context, deps);

    expect(result).toMatchObject({
      id: "music-regen-123",
      label: "Regenerated Music",
      prompt: "New orchestral music with strings",
      duration: 45,
      audioUrl: "user-1/42/musical-score/music-regen-123.mp3",
    });

    expect(mockGenerateMusics).toHaveBeenCalledTimes(1);
    expect(mockStorage.savedFiles.size).toBe(1);
  });

  it("saves to correct path", async () => {
    const request = {
      prompt: "Test music",
      durationSeconds: 30,
      musicId: "music-path-test",
    };

    const context: MusicGenerationContext = {
      userId: "user-456",
      projectId: 789,
    };

    const mockStorage = new MockStorageHandler();
    const mockGenerateMusics = vi.fn(async () => [Buffer.from("music")]);

    const deps: MusicOrchestratorDeps = {
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
    };

    await regenerateMusic(request, context, deps);

    const paths = mockStorage.getSavedPaths();
    expect(paths).toHaveLength(1);
    expect(paths[0]).toBe("user-456/789/musical-score/music-path-test.mp3");
  });

  it("logs regeneration activity", async () => {
    const request = {
      prompt: "Test music prompt",
      durationSeconds: 30,
      musicId: "music-log-test",
    };

    const context: MusicGenerationContext = {
      userId: "user-1",
      projectId: 42,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const mockGenerateMusics = vi.fn(async () => [Buffer.from("music")]);

    const deps: MusicOrchestratorDeps = {
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
      logger: mockLogger,
    };

    await regenerateMusic(request, context, deps);

    expect(mockLogger.findLog("Regenerating music")).toBe(true);
    expect(mockLogger.findLog("Music regenerated and saved")).toBe(true);
  });

  it("uses default model when not specified", async () => {
    const request = {
      prompt: "Test music",
      durationSeconds: 30,
      musicId: "music-default-test",
    };

    const context: MusicGenerationContext = {
      userId: "user-1",
      projectId: 42,
    };

    const mockLogger = new MockLogger();
    const mockStorage = new MockStorageHandler();
    const mockGenerateMusics = vi.fn(async () => [Buffer.from("music")]);

    const deps: MusicOrchestratorDeps = {
      generateMusics: mockGenerateMusics,
      saveFile: mockStorage.saveFile.bind(mockStorage),
      logger: mockLogger,
    };

    await regenerateMusic(request, context, deps);

    // Check logger for default model
    expect(
      mockLogger.logs.some((log) => {
        const context = log.context as { model?: string } | undefined;
        return context?.model === "stability-ai/stable-audio-2.5";
      })
    ).toBe(true);
  });
});
