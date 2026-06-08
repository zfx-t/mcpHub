import type { DiagnosticRecord, ErrorCode, ExtractionMethod } from "./types.js";

const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  FETCH_BLOCKED: "The target site blocked fetching or returned an anti-bot challenge.",
  FETCH_TIMEOUT: "Fetching the target URL timed out.",
  RULE_MISMATCH: "The selected rule matched the URL but did not extract required fields.",
  EXTRACTION_LOW_CONFIDENCE: "Generic extraction produced low-confidence content.",
  AUTH_REQUIRED: "The content appears to require authentication.",
  RATE_LIMITED: "The service or target site rate limit was reached.",
  UNSUPPORTED_SITE: "No Source or Rule exists for this site.",
  ROBOTS_OR_POLICY_BLOCKED: "Extraction is blocked by service policy."
};

export function createDiagnostic(input: {
  code: ErrorCode;
  sourceId?: string;
  ruleId?: string;
  itemId?: string;
  url?: string;
  message?: string;
  extractionMethod?: ExtractionMethod;
  retryable?: boolean;
  suggestedNextAction?: string;
  details?: Record<string, unknown>;
}): DiagnosticRecord {
  return {
    id: `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    sourceId: input.sourceId,
    ruleId: input.ruleId,
    itemId: input.itemId,
    url: input.url,
    code: input.code,
    message: input.message ?? DEFAULT_MESSAGES[input.code],
    extractionMethod: input.extractionMethod,
    timestamp: new Date().toISOString(),
    retryable: input.retryable ?? isRetryable(input.code),
    suggestedNextAction: input.suggestedNextAction ?? defaultNextAction(input.code),
    details: input.details
  };
}

export function isRetryable(code: ErrorCode): boolean {
  return code === "FETCH_TIMEOUT" || code === "RATE_LIMITED" || code === "FETCH_BLOCKED";
}

function defaultNextAction(code: ErrorCode): string {
  switch (code) {
    case "UNSUPPORTED_SITE":
      return "Create or import a Source and Rule for this site.";
    case "AUTH_REQUIRED":
      return "Use a public page or configure a private self-hosted Source later.";
    case "RULE_MISMATCH":
      return "Inspect rule diagnostics and update the rule mapping.";
    case "EXTRACTION_LOW_CONFIDENCE":
      return "Add a validated rule or custom route for this page type.";
    default:
      return "Retry later or inspect debug diagnostics.";
  }
}
