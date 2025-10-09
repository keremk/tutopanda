import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateImage, imageProviderRegistry } from "./image-generator";
import { MockImageProvider, MockImageProviderWithURL, MockLogger } from "../__test-utils__/mocks";
import type { ImageConfig } from "./types";

describe("generateImage", () => {
  let mockProvider: MockImageProvider;
  let mockLogger: MockLogger;

  beforeEach(() => {
    mockProvider = new MockImageProvider();
    mockLogger = new MockLogger();
    imageProviderRegistry.register(mockProvider);
  });

  afterEach(() => {
    // Clean up registry after each test
    imageProviderRegistry["providers"].clear();
  });

  it("generates image with valid config", async () => {
    const prompt = "A beautiful sunset over the ocean";
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
      model: "bytedance/seedream-4",
    };

    const result = await generateImage(prompt, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBeGreaterThan(0);
    expect(mockLogger.findLog("Generating image")).toBe(true);
  });

  it("uses default model bytedance/seedream-4 when not specified", async () => {
    const prompt = "Test prompt";
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
    };

    const result = await generateImage(prompt, config, {
      provider: mockProvider,
    });

    expect(result).toBeInstanceOf(Buffer);
  });

  it("uses provided model from config", async () => {
    const prompt = "Test prompt";
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
      model: "google/nano-banana",
    };

    const result = await generateImage(prompt, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(
      mockLogger.logs.some((log) => {
        const context = log.context as { model?: string } | undefined;
        return context?.model === "google/nano-banana";
      })
    ).toBe(true);
  });

  it("looks up provider from registry when custom provider not provided", async () => {
    const prompt = "Test prompt";
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
      model: "bytedance/seedream-4",
    };

    const result = await generateImage(prompt, config, {
      logger: mockLogger,
    });

    expect(result).toBeInstanceOf(Buffer);
  });

  it("converts URL to Buffer when provider returns URL", async () => {
    const mockUrlProvider = new MockImageProviderWithURL();

    // Mock fetch to return a buffer
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(100),
    });

    const prompt = "Test prompt";
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
      model: "bytedance/seedream-4",
    };

    const result = await generateImage(prompt, config, {
      provider: mockUrlProvider,
    });

    expect(result).toBeInstanceOf(Buffer);
    expect(result.length).toBe(100);
    expect(global.fetch).toHaveBeenCalledWith("https://example.com/generated-image.jpg");
  });

  it("throws error when fetch fails for URL", async () => {
    const mockUrlProvider = new MockImageProviderWithURL();

    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Not Found",
    });

    const prompt = "Test prompt";
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
      model: "bytedance/seedream-4",
    };

    await expect(
      generateImage(prompt, config, {
        provider: mockUrlProvider,
      })
    ).rejects.toThrow("Failed to fetch image from URL");
  });

  it("passes through Buffer when provider returns Buffer", async () => {
    const prompt = "Test prompt";
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
      model: "bytedance/seedream-4",
    };

    const result = await generateImage(prompt, config, {
      provider: mockProvider,
    });

    expect(result).toBeInstanceOf(Buffer);
  });

  it("uses default values for optional config fields", async () => {
    const prompt = "Test prompt";
    const config: ImageConfig = {
      model: "bytedance/seedream-4",
    };

    const result = await generateImage(prompt, config, {
      provider: mockProvider,
    });

    expect(result).toBeInstanceOf(Buffer);
  });

  it("logs with preview of prompt", async () => {
    const longPrompt = "A ".repeat(100); // Very long prompt
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
      model: "bytedance/seedream-4",
    };

    await generateImage(longPrompt, config, {
      provider: mockProvider,
      logger: mockLogger,
    });

    const logMessage = mockLogger.logs.find((log) => log.message === "Generating image");
    expect(logMessage).toBeDefined();
    const logContext = logMessage?.context as { promptPreview?: string } | undefined;
    expect(logContext?.promptPreview).toBeDefined();
    // Should truncate to 100 chars + "..."
    expect(logContext?.promptPreview?.length).toBeLessThanOrEqual(104);
  });

  it("handles provider errors gracefully", async () => {
    const errorProvider = {
      ...mockProvider,
      generateImage: vi.fn().mockRejectedValue(new Error("Provider error")),
    };

    const prompt = "Test prompt";
    const config: ImageConfig = {
      aspectRatio: "16:9",
      size: "1K",
      width: 1920,
      height: 1080,
      model: "bytedance/seedream-4",
    };

    await expect(
      generateImage(prompt, config, {
        provider: errorProvider,
      })
    ).rejects.toThrow("Provider error");
  });
});
