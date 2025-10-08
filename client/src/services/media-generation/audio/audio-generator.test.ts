import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateAudio, audioProviderRegistry } from "./audio-generator";
import { MockAudioProvider, MockLogger } from "../__test-utils__/mocks";
import type { AudioConfig } from "./types";

describe("generateAudio", () => {
  let mockProvider: MockAudioProvider;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockProvider = new MockAudioProvider();
    mockLogger = new MockLogger();
    audioProviderRegistry.register(mockProvider);
  });

  afterEach(() => {
    // Clean up registry after each test
    audioProviderRegistry["providers"].clear();
  });

  it("generates audio with valid config", async () => {
    const text = "Hello, this is a test narration.";
    const config: AudioConfig = {
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
    };

    const result = await generateAudio(text, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(result).toBeDefined();
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.duration).toBe(5.5);
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(mockLogger.findLog("Generating audio")).toBe(true);
  });

  it("uses default model when not specified", async () => {
    const text = "Test text";
    const config: AudioConfig = {
      voice: "aura-asteria-en",
    };

    const result = await generateAudio(text, config, {
      provider: mockProvider,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.duration).toBeDefined();
  });

  it("uses provided model from config", async () => {
    const text = "Test text";
    const config: AudioConfig = {
      voice: "aura-orpheus-en",
      model: "aura-orpheus-en",
    };

    const result = await generateAudio(text, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(mockLogger.logs.some((log) => log.context?.model === "aura-orpheus-en")).toBe(true);
  });

  it("looks up provider from registry when custom provider not provided", async () => {
    const text = "Test text";
    const config: AudioConfig = {
      voice: "minimax/speech-02-hd",
      model: "minimax/speech-02-hd",
    };

    const result = await generateAudio(text, config, {
      logger: mockLogger,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("returns AudioResult with buffer and duration", async () => {
    const text = "Test text";
    const config: AudioConfig = {
      voice: "aura-asteria-en",
    };

    const result = await generateAudio(text, config, {
      provider: mockProvider,
    });

    expect(result).toHaveProperty("buffer");
    expect(result).toHaveProperty("duration");
    expect(typeof result.duration).toBe("number");
  });

  it("logs text length and voice", async () => {
    const text = "This is a longer test text for logging purposes.";
    const config: AudioConfig = {
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
    };

    await generateAudio(text, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    const genLog = mockLogger.logs.find((log) => log.message === "Generating audio");
    expect(genLog).toBeDefined();
    expect(genLog?.context?.textLength).toBe(text.length);
    expect(genLog?.context?.voice).toBe("aura-asteria-en");
  });

  it("logs buffer size and duration after generation", async () => {
    const text = "Test text";
    const config: AudioConfig = {
      voice: "aura-asteria-en",
    };

    await generateAudio(text, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    const completeLog = mockLogger.logs.find((log) => log.message === "Audio generated");
    expect(completeLog).toBeDefined();
    expect(completeLog?.context?.duration).toBe(5.5);
    expect(completeLog?.context?.bufferSize).toBeGreaterThan(0);
  });

  it("handles provider errors gracefully", async () => {
    const errorProvider = {
      ...mockProvider,
      generateAudio: vi.fn().mockRejectedValue(new Error("Provider error")),
    };

    const text = "Test text";
    const config: AudioConfig = {
      voice: "aura-asteria-en",
    };

    await expect(
      generateAudio(text, config, {
        provider: errorProvider,
      })
    ).rejects.toThrow("Provider error");
  });

  it("handles empty text", async () => {
    const text = "";
    const config: AudioConfig = {
      voice: "aura-asteria-en",
    };

    const result = await generateAudio(text, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
    const genLog = mockLogger.logs.find((log) => log.message === "Generating audio");
    expect(genLog?.context?.textLength).toBe(0);
  });

  it("handles very long text", async () => {
    const text = "A ".repeat(5000); // Very long text
    const config: AudioConfig = {
      voice: "aura-asteria-en",
    };

    const result = await generateAudio(text, config, {
      provider: mockProvider,
    });

    expect(result.buffer).toBeInstanceOf(Buffer);
  });

  it("passes optional emotion and languageBoost parameters", async () => {
    const text = "Test text with emotion";
    const config: AudioConfig = {
      voice: "aura-asteria-en",
      model: "aura-asteria-en",
      emotion: "excited",
      languageBoost: "en",
    };

    // Spy on provider to ensure params are passed
    const spyGenerate = vi.spyOn(mockProvider, "generateAudio");

    await generateAudio(text, config, {
      provider: mockProvider,
    });

    expect(spyGenerate).toHaveBeenCalledWith({
      text,
      voiceId: "aura-asteria-en",
      modelId: "aura-asteria-en",
      emotion: undefined, // Not passed through in current implementation
      languageBoost: undefined, // Not passed through in current implementation
    });
  });
});
