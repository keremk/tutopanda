/**
 * Test utilities and mocks for media generation tests
 */

import type { ImageProvider, ImageGenerationParams } from "../image/types";
import type { AudioProvider, AudioGenerationParams, AudioGenerationResult } from "../audio/types";
import type { MusicProvider, MusicGenerationParams } from "../music/types";
import type { Logger } from "../core/types";
import type { LectureScript, ImageGenerationDefaults } from "@/types/types";

/**
 * Mock Image Provider for testing
 */
export class MockImageProvider implements ImageProvider {
  name = "mock-image";
  supportedModels = ["bytedance/seedream-4", "google/nano-banana", "qwen/qwen-image"];

  async generateImage(_params: ImageGenerationParams): Promise<Buffer> {
    // Return a tiny 1x1 PNG buffer
    return Buffer.from([
      137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1,
      0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 10, 73, 68, 65, 84,
      120, 156, 99, 0, 1, 0, 0, 5, 0, 1, 13, 10, 46, 180, 0, 0, 0, 0, 73, 69,
      78, 68, 174, 66, 96, 130,
    ]);
  }

  isModelSupported(model: string): boolean {
    return this.supportedModels.includes(model);
  }
}

/**
 * Mock Image Provider that returns URLs instead of Buffers
 */
export class MockImageProviderWithURL implements ImageProvider {
  name = "mock-image-url";
  supportedModels = ["SeaDream"];

  async generateImage(_params: ImageGenerationParams): Promise<string> {
    return "https://example.com/generated-image.jpg";
  }

  isModelSupported(model: string): boolean {
    return this.supportedModels.includes(model);
  }
}

/**
 * Mock Audio Provider for testing
 */
export class MockAudioProvider implements AudioProvider {
  name = "mock-audio";
  supportedModels = ["minimax/speech-02-hd"];

  async generateAudio(_params: AudioGenerationParams): Promise<AudioGenerationResult> {
    // Return a tiny audio buffer with mock duration
    return {
      buffer: Buffer.from("mock-audio-data"),
      duration: 5.5, // 5.5 seconds
    };
  }

  isModelSupported(model: string): boolean {
    return this.supportedModels.includes(model);
  }
}

/**
 * Mock Music Provider for testing
 */
export class MockMusicProvider implements MusicProvider {
  name = "mock-music";
  supportedModels = ["stability-ai/stable-audio-2.5"];

  async generateMusic(_params: MusicGenerationParams): Promise<Buffer> {
    return Buffer.from("mock-music-data");
  }

  isModelSupported(model: string): boolean {
    return this.supportedModels.includes(model);
  }
}

/**
 * Mock Logger for testing
 */
export class MockLogger implements Logger {
  logs: Array<{ level: string; message: string; context?: unknown }> = [];

  info(message: string, context?: unknown): void {
    this.logs.push({ level: "info", message, context });
  }

  error(message: string, context?: unknown): void {
    this.logs.push({ level: "error", message, context });
  }

  warn(message: string, context?: unknown): void {
    this.logs.push({ level: "warn", message, context });
  }

  clear(): void {
    this.logs = [];
  }

  findLog(messagePattern: string): boolean {
    return this.logs.some((log) => log.message.includes(messagePattern));
  }
}

/**
 * Create a test LectureScript with N segments
 */
export function createMockLectureScript(segmentCount: number): LectureScript {
  const segments = Array.from({ length: segmentCount }, (_, i) => ({
    narration: `This is segment ${i + 1} narration text.`,
    backgroundMusic: `Background music for segment ${i + 1}`,
    effect: `Sound effect for segment ${i + 1}`,
  }));

  return {
    segments,
  };
}

/**
 * Create default ImageGenerationDefaults for testing
 */
export function createMockImageConfig(): ImageGenerationDefaults {
  return {
    width: 1024,
    height: 576,
    aspectRatio: "16:9",
    size: "1K",
    style: "Realistic",
    imagesPerSegment: 1,
  };
}

/**
 * Mock storage handler that tracks saved files
 */
export class MockStorageHandler {
  savedFiles: Map<string, Buffer> = new Map();

  async saveFile(buffer: Buffer, path: string): Promise<void> {
    this.savedFiles.set(path, buffer);
  }

  getFile(path: string): Buffer | undefined {
    return this.savedFiles.get(path);
  }

  clear(): void {
    this.savedFiles.clear();
  }

  getSavedPaths(): string[] {
    return Array.from(this.savedFiles.keys());
  }
}

/**
 * Create a delay promise for testing async behavior
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
