import { createMediaGenerationError, type MediaGenerationError } from "./types";

type ReplicateErrorClassification = "sensitive" | "rate_limit" | "transient" | "fatal";

const SENSITIVE_KEYWORDS = ["flagged as sensitive", "content violation", "policy violation"];
const RATE_LIMIT_KEYWORDS = ["rate limit", "too many requests", "slow down", "overloaded"];
const TRANSIENT_KEYWORDS = ["timeout", "failed to start", "internal error", "temporary", "retry"];

const SENSITIVE_CODES = new Set(["E005"]);
const RATE_LIMIT_CODES = new Set(["E6716", "E9243"]);
const TRANSIENT_CODES = new Set(["E1000", "E8765", "E8367", "E9825"]);

export function mapReplicateErrorToMediaError({
  error,
  model,
  provider,
  context,
  promptPreview,
}: {
  error: unknown;
  model: string;
  provider: string;
  context: string;
  promptPreview?: string;
}): MediaGenerationError {
  const baseMessage =
    error instanceof Error && typeof error.message === "string"
      ? error.message
      : "Replicate request failed";

  const providerCode = extractProviderCode(baseMessage);
  const classification = classifyReplicateError(baseMessage, providerCode);

  switch (classification) {
    case "sensitive":
      return createMediaGenerationError({
        code: "SENSITIVE_CONTENT",
        provider,
        model,
        providerCode,
        isRetryable: false,
        userActionRequired: true,
        message:
          "Replicate flagged this prompt as sensitive. Please adjust the prompt contents and try again.",
        cause: error,
      });

    case "rate_limit":
      return createMediaGenerationError({
        code: "RATE_LIMITED",
        provider,
        model,
        providerCode,
        isRetryable: true,
        userActionRequired: false,
        message: "Replicate rate limit reached. The request will be retried automatically.",
        cause: error,
        retryAfterMs: extractRetryAfter(baseMessage),
      });

    case "transient":
      return createMediaGenerationError({
        code: "TRANSIENT_PROVIDER_ERROR",
        provider,
        model,
        providerCode,
        isRetryable: true,
        userActionRequired: false,
        message: "Replicate encountered a temporary issue. The request will be retried.",
        cause: error,
      });

    default:
      return createMediaGenerationError({
        code: "PROVIDER_FAILURE",
        provider,
        model,
        providerCode,
        isRetryable: false,
        userActionRequired: false,
        message: buildFatalMessage(context, promptPreview),
        cause: error,
      });
  }
}

function extractProviderCode(message: string): string | undefined {
  const match = message.match(/\b(E\d{3,4})\b/);
  return match?.[1];
}

function classifyReplicateError(message: string, providerCode?: string): ReplicateErrorClassification {
  const lower = message.toLowerCase();

  if (providerCode && SENSITIVE_CODES.has(providerCode)) {
    return "sensitive";
  }

  if (SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "sensitive";
  }

  if (providerCode && RATE_LIMIT_CODES.has(providerCode)) {
    return "rate_limit";
  }

  if (RATE_LIMIT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "rate_limit";
  }

  if (providerCode && TRANSIENT_CODES.has(providerCode)) {
    return "transient";
  }

  if (TRANSIENT_KEYWORDS.some((keyword) => lower.includes(keyword))) {
    return "transient";
  }

  return "fatal";
}

function extractRetryAfter(message: string): number | undefined {
  const retryAfterMatch = message.match(/retry\s+after\s+(\d+)(?:\s*seconds|s)?/i);
  if (retryAfterMatch) {
    const seconds = Number.parseInt(retryAfterMatch[1], 10);
    if (Number.isFinite(seconds)) {
      return seconds * 1000;
    }
  }
  return undefined;
}

function buildFatalMessage(context: string, promptPreview?: string): string {
  if (promptPreview) {
    return `${context} (prompt: "${promptPreview}...")`;
  }
  return context;
}
