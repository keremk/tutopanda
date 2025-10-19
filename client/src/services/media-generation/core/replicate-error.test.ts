import { describe, it, expect } from "vitest";
import { mapReplicateErrorToMediaError } from "./replicate-error";

const baseArgs = {
  provider: "replicate",
  model: "owner/model",
  context: "Replicate request failed",
} as const;

describe("mapReplicateErrorToMediaError", () => {
  it("classifies sensitive content errors", () => {
    const error = new Error("helpers.exceptions.prediction.ModelError: flagged as sensitive (E005)");

    const result = mapReplicateErrorToMediaError({
      error,
      promptPreview: "prompt",
      ...baseArgs,
    });

    expect(result.code).toBe("SENSITIVE_CONTENT");
    expect(result.providerCode).toBe("E005");
    expect(result.isRetryable).toBe(false);
    expect(result.userActionRequired).toBe(true);
  });

  it("classifies rate limited errors using provider code", () => {
    const error = new Error("Rate limit reached (E6716)");

    const result = mapReplicateErrorToMediaError({
      error,
      promptPreview: "prompt",
      ...baseArgs,
    });

    expect(result.code).toBe("RATE_LIMITED");
    expect(result.isRetryable).toBe(true);
  });

  it("classifies transient errors by message", () => {
    const error = new Error("Timeout starting prediction");

    const result = mapReplicateErrorToMediaError({
      error,
      promptPreview: "prompt",
      ...baseArgs,
    });

    expect(result.code).toBe("TRANSIENT_PROVIDER_ERROR");
    expect(result.isRetryable).toBe(true);
  });

  it("falls back to provider failure when no match", () => {
    const error = new Error("Unhandled error from replicate");

    const result = mapReplicateErrorToMediaError({
      error,
      promptPreview: "prompt",
      ...baseArgs,
    });

    expect(result.code).toBe("PROVIDER_FAILURE");
    expect(result.isRetryable).toBe(false);
  });
});
