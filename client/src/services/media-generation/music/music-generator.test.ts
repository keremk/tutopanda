import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateMusic, musicProviderRegistry } from "./music-generator";
import { MockMusicProvider, MockLogger } from "../__test-utils__/mocks";
import type { MusicConfig } from "./types";

describe("generateMusic", () => {
  let mockProvider: MockMusicProvider;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockProvider = new MockMusicProvider();
    mockLogger = new MockLogger();
    musicProviderRegistry.register(mockProvider);
  });

  afterEach(() => {
    // Clean up registry after each test
    musicProviderRegistry["providers"].clear();
  });

  it("generates music with valid config", async () => {
    const prompt = "Upbeat background music with piano and strings";
    const config: MusicConfig = {
      durationSeconds: 30,
      model: "stable-audio-2.5",
    };

    const result = await generateMusic(prompt, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(mockLogger.findLog("Generating music")).toBe(true);
  });

  it("uses default model when not specified", async () => {
    const prompt = "Test music prompt";
    const config: MusicConfig = {
      durationSeconds: 30,
    };

    const result = await generateMusic(prompt, config, {
      provider: mockProvider,
    });

    expect(result).toBeInstanceOf(Buffer);
  });

  it("uses provided model from config", async () => {
    const prompt = "Test music prompt";
    const config: MusicConfig = {
      durationSeconds: 30,
      model: "stable-audio-2.5",
    };

    const result = await generateMusic(prompt, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(mockLogger.logs.some((log) => log.context?.model === "stable-audio-2.5")).toBe(true);
  });

  it("looks up provider from registry when custom provider not provided", async () => {
    const prompt = "Test music prompt";
    const config: MusicConfig = {
      durationSeconds: 30,
      model: "stability-ai/stable-audio-2.5",
    };

    const result = await generateMusic(prompt, config, {
      logger: mockLogger,
    });

    expect(result).toBeInstanceOf(Buffer);
  });

  it("logs with preview of prompt and duration", async () => {
    const longPrompt = "Upbeat ".repeat(50); // Very long prompt
    const config: MusicConfig = {
      durationSeconds: 60,
      model: "stable-audio-2.5",
    };

    await generateMusic(longPrompt, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    const genLog = mockLogger.logs.find((log) => log.message === "Generating music");
    expect(genLog).toBeDefined();
    expect(genLog?.context?.promptPreview).toBeDefined();
    // Should truncate to 100 chars + "..."
    expect(genLog?.context?.promptPreview.length).toBeLessThanOrEqual(104);
    expect(genLog?.context?.durationSeconds).toBe(60);
  });

  it("logs buffer size after generation", async () => {
    const prompt = "Test music prompt";
    const config: MusicConfig = {
      durationSeconds: 30,
    };

    await generateMusic(prompt, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    const completeLog = mockLogger.logs.find((log) => log.message === "Music generated");
    expect(completeLog).toBeDefined();
    expect(completeLog?.context?.bufferSize).toBeGreaterThan(0);
  });

  it("handles provider errors gracefully", async () => {
    const errorProvider = {
      ...mockProvider,
      generateMusic: vi.fn().mockRejectedValue(new Error("Provider error")),
    };

    const prompt = "Test music prompt";
    const config: MusicConfig = {
      durationSeconds: 30,
    };

    await expect(
      generateMusic(prompt, config, {
        provider: errorProvider,
      })
    ).rejects.toThrow("Provider error");
  });

  it("handles different duration values", async () => {
    const prompt = "Test music prompt";

    // Short duration
    let result = await generateMusic(prompt, { durationSeconds: 10 }, { provider: mockProvider });
    expect(result).toBeInstanceOf(Buffer);

    // Long duration
    result = await generateMusic(prompt, { durationSeconds: 300 }, { provider: mockProvider });
    expect(result).toBeInstanceOf(Buffer);
  });

  it("handles empty prompt", async () => {
    const prompt = "";
    const config: MusicConfig = {
      durationSeconds: 30,
    };

    const result = await generateMusic(prompt, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(result).toBeInstanceOf(Buffer);
    const genLog = mockLogger.logs.find((log) => log.message === "Generating music");
    expect(genLog?.context?.promptPreview).toBe("...");
  });

  it("passes correct parameters to provider", async () => {
    const prompt = "Ambient soundscape";
    const config: MusicConfig = {
      durationSeconds: 45,
      model: "stability-ai/stable-audio-2.5",
    };

    const spyGenerate = vi.spyOn(mockProvider, "generateMusic");

    await generateMusic(prompt, config, {
      provider: mockProvider,
    });

    expect(spyGenerate).toHaveBeenCalledWith({
      prompt,
      durationSeconds: 45,
      model: "stability-ai/stable-audio-2.5",
    });
  });

  it("returns Buffer directly from provider", async () => {
    const prompt = "Test music prompt";
    const config: MusicConfig = {
      durationSeconds: 30,
    };

    const testBuffer = Buffer.from("test-music-buffer");
    mockProvider.generateMusic = vi.fn().mockResolvedValue(testBuffer);

    const result = await generateMusic(prompt, config, {
      provider: mockProvider,
    });

    expect(result).toBe(testBuffer);
  });
});
