import type { FileStorage } from "@flystorage/file-storage";
import type { StorageHandler } from "./types";

/**
 * Storage handler implementation using FileStorage.
 * Provides a clean abstraction for saving generated media files.
 */
export class FileStorageHandler implements StorageHandler {
  constructor(private storage: FileStorage) {}

  async saveFile(
    content: Buffer | Uint8Array | ReadableStream,
    filePath: string
  ): Promise<void> {
    // FileStorage accepts Buffer or Uint8Array
    if (content instanceof ReadableStream) {
      const buffer = await this.streamToBuffer(content);
      await this.storage.write(filePath, buffer);
    } else {
      await this.storage.write(filePath, content);
    }
  }

  private async streamToBuffer(stream: ReadableStream): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  }
}

/**
 * In-memory storage handler for testing.
 */
export class InMemoryStorageHandler implements StorageHandler {
  public files: Map<string, Buffer> = new Map();

  async saveFile(
    content: Buffer | Uint8Array | ReadableStream,
    filePath: string
  ): Promise<void> {
    const buffer =
      content instanceof Buffer
        ? content
        : content instanceof Uint8Array
          ? Buffer.from(content)
          : await this.streamToBuffer(content);

    this.files.set(filePath, buffer);
  }

  private async streamToBuffer(stream: ReadableStream): Promise<Buffer> {
    const reader = stream.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }

    return Buffer.concat(chunks);
  }

  getFile(filePath: string): Buffer | undefined {
    return this.files.get(filePath);
  }

  clear(): void {
    this.files.clear();
  }
}
