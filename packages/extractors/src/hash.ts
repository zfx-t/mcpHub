import { createHash } from "node:crypto";

export function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 24);
}

export function stableId(prefix: string, value: unknown): string {
  return `${prefix}_${stableHash(value).slice(0, 16)}`;
}
