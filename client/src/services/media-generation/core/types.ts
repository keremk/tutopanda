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

export type MediaGenerationErrorCode =
  | "SENSITIVE_CONTENT"
  | "PROVIDER_FAILURE"
  | "RATE_LIMITED"
  | "TRANSIENT_PROVIDER_ERROR"
  | "UNKNOWN";

export interface MediaGenerationError extends ProviderError {
  code: MediaGenerationErrorCode;
  providerCode?: string;
  isRetryable: boolean;
  userActionRequired?: boolean;
  retryAfterMs?: number;
}

export function isMediaGenerationError(error: unknown): error is MediaGenerationError {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as Partial<MediaGenerationError>;

  return (
    typeof candidate.provider === "string" &&
    typeof candidate.model === "string" &&
    typeof candidate.message === "string" &&
    typeof candidate.code === "string" &&
    typeof candidate.isRetryable === "boolean"
  );
}

export function createMediaGenerationError(
  overrides: Partial<MediaGenerationError> &
    Pick<MediaGenerationError, "code" | "provider" | "model" | "message">
): MediaGenerationError {
  return {
    providerCode: undefined,
    isRetryable: false,
    userActionRequired: false,
    cause: undefined,
    retryAfterMs: undefined,
    ...overrides,
  };
}
