const sensitiveKeyPattern = /token|secret|password|authorization|cookie|api[_-]?key/i;
const sensitiveTextPattern = /((?:token|secret|password|authorization|cookie|api[_-]?key)=)[^&\s]+/gi;
const bearerPattern = /(bearer\s+)[a-z0-9._~+/=-]+/gi;

export function redactSecrets(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactSecrets(entry));
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    redacted[key] = sensitiveKeyPattern.test(key) ? "[REDACTED]" : redactSecrets(entry);
  }
  return redacted;
}

export function redactUrl(value: string): string {
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (sensitiveKeyPattern.test(key)) {
        url.searchParams.set(key, "[REDACTED]");
      }
    }
    return redactText(url.toString());
  } catch {
    return redactText(value);
  }
}

export function redactText(value: string): string {
  return value.replace(sensitiveTextPattern, "$1[REDACTED]").replace(bearerPattern, "$1[REDACTED]");
}
