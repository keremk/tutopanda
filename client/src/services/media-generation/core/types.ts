/**
 * Base types and interfaces for the media generation system.
 * This provides a unified foundation for images, audio, and music generation.
 */

export interface MediaProvider {
  /** Provider name (e.g., "replicate", "fal") */
  name: string;
  /** List of model identifiers this provider supports */
  supportedModels: string[];
}

export interface Logger {
  info(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
  warn?(message: string, data?: Record<string, unknown>): void;
}

export interface StorageHandler {
  saveFile(content: Buffer | Uint8Array | ReadableStream, filePath: string): Promise<void>;
}

export interface GenerationOptions {
  storageHandler?: StorageHandler;
  logger?: Logger;
}

export type ProviderError = {
  provider: string;
  model: string;
  message: string;
  cause?: unknown;
};
