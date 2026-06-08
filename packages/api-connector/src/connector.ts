import { Buffer } from "node:buffer";
import type { PlatformErrorCode } from "@mcphub/core";
import type { ResolvedCredential } from "@mcphub/credentials";
import { redactSecrets, redactUrl } from "./redaction.js";

export type ApiHttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface ApiRequest {
  baseUrl: string;
  method: ApiHttpMethod;
  path: string;
  pathParams?: Record<string, string | number | boolean>;
  query?: Record<string, unknown>;
  headers?: Record<string, string>;
  body?: unknown;
  credentials?: ResolvedCredential[];
  timeoutMs?: number;
}

export interface ApiResponseMetadata {
  statusCode?: number;
  durationMs: number;
  targetUrl: string;
}

export type ApiConnectorResult =
  | { ok: true; data: unknown; metadata: ApiResponseMetadata }
  | {
      ok: false;
      error: {
        code: Extract<PlatformErrorCode, "REMOTE_HTTP_ERROR" | "REMOTE_TIMEOUT" | "CREDENTIAL_INVALID">;
        message: string;
        retryable: boolean;
      };
      metadata: ApiResponseMetadata;
    };

export interface ApiConnectorOptions {
  fetchImpl?: typeof fetch;
  defaultTimeoutMs?: number;
}

export class ApiConnector {
  private readonly fetchImpl: typeof fetch;
  private readonly defaultTimeoutMs: number;

  constructor(options: ApiConnectorOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.defaultTimeoutMs = options.defaultTimeoutMs ?? 10_000;
  }

  async executeJson(request: ApiRequest): Promise<ApiConnectorResult> {
    const startedAt = performance.now();
    const controller = new AbortController();
    const timeoutMs = request.timeoutMs ?? this.defaultTimeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let url: URL;
    try {
      url = buildUrl(request);
      const headers = new Headers(request.headers);
      headers.set("Accept", "application/json");
      if (request.body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }
      const credentialError = injectCredentials(url, headers, request.credentials ?? []);
      if (credentialError) {
        return failure("CREDENTIAL_INVALID", credentialError, false, startedAt, url.toString());
      }

      const response = await this.fetchImpl(url, {
        method: request.method,
        headers,
        body: request.body === undefined ? undefined : JSON.stringify(request.body),
        signal: controller.signal
      });
      const data = await parseResponseBody(response);
      const metadata = metadataFrom(startedAt, url.toString(), response.status);
      if (!response.ok) {
        return {
          ok: false,
          error: {
            code: "REMOTE_HTTP_ERROR",
            message: `Remote API returned HTTP ${response.status}.`,
            retryable: response.status >= 500
          },
          metadata
        };
      }
      return {
        ok: true,
        data,
        metadata
      };
    } catch (error) {
      const target = "url" in request ? `${request.baseUrl}${request.path}` : request.baseUrl;
      if (error instanceof DOMException && error.name === "AbortError") {
        return failure("REMOTE_TIMEOUT", `Remote API timed out after ${timeoutMs}ms.`, true, startedAt, target);
      }
      if (isAbortError(error)) {
        return failure("REMOTE_TIMEOUT", `Remote API timed out after ${timeoutMs}ms.`, true, startedAt, target);
      }
      return failure("REMOTE_HTTP_ERROR", error instanceof Error ? error.message : "Remote API request failed.", false, startedAt, target);
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function buildUrl(request: Pick<ApiRequest, "baseUrl" | "path" | "pathParams" | "query">): URL {
  const base = request.baseUrl.endsWith("/") ? request.baseUrl : `${request.baseUrl}/`;
  const path = request.path.replace(/^\//, "").replace(/\{([^}]+)\}/g, (_match, key: string) => {
    const value = request.pathParams?.[key];
    if (value === undefined) {
      throw new Error(`Missing path parameter ${key}.`);
    }
    return encodeURIComponent(String(value));
  });
  const url = new URL(path, base);
  for (const [key, value] of Object.entries(request.query ?? {})) {
    appendQueryValue(url, key, value);
  }
  return url;
}

export function injectCredentials(url: URL, headers: Headers, credentials: ResolvedCredential[]): string | undefined {
  for (const credential of credentials) {
    if (!credential.value) {
      return `Credential ${credential.id} is empty.`;
    }
    switch (credential.type) {
      case "bearer":
        headers.set("Authorization", `Bearer ${credential.value}`);
        break;
      case "api_key_header":
        headers.set(credential.scope ?? "X-API-Key", credential.value);
        break;
      case "api_key_query":
        url.searchParams.set(credential.scope ?? "api_key", credential.value);
        break;
      case "basic":
        headers.set("Authorization", `Basic ${Buffer.from(basicCredentialValue(credential.value)).toString("base64")}`);
        break;
      case "cookie":
        headers.set("Cookie", credential.value);
        break;
      case "env":
        applyEnvCredential(url, headers, credential);
        break;
    }
  }
  return undefined;
}

function basicCredentialValue(value: string): string {
  try {
    const parsed = JSON.parse(value) as { username?: unknown; password?: unknown };
    if (typeof parsed.username === "string" && typeof parsed.password === "string") {
      return `${parsed.username}:${parsed.password}`;
    }
  } catch {
    // Plain user:password values are also accepted for local deployments.
  }
  return value;
}

function applyEnvCredential(url: URL, headers: Headers, credential: ResolvedCredential): void {
  const scope = credential.scope ?? "header:Authorization";
  if (scope.startsWith("query:")) {
    url.searchParams.set(scope.slice("query:".length), credential.value);
    return;
  }
  if (scope.startsWith("cookie")) {
    headers.set("Cookie", credential.value);
    return;
  }
  const headerName = scope.startsWith("header:") ? scope.slice("header:".length) : scope;
  headers.set(headerName, credential.value);
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

function appendQueryValue(url: URL, key: string, value: unknown): void {
  if (value === undefined || value === null) {
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      appendQueryValue(url, key, entry);
    }
    return;
  }
  url.searchParams.append(key, String(value));
}

function failure(
  code: "REMOTE_HTTP_ERROR" | "REMOTE_TIMEOUT" | "CREDENTIAL_INVALID",
  message: string,
  retryable: boolean,
  startedAt: number,
  targetUrl: string
): ApiConnectorResult {
  return {
    ok: false,
    error: { code, message, retryable },
    metadata: metadataFrom(startedAt, targetUrl)
  };
}

function metadataFrom(startedAt: number, targetUrl: string, statusCode?: number): ApiResponseMetadata {
  return {
    statusCode,
    durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
    targetUrl: redactUrl(targetUrl)
  };
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

export function summarizeRequest(request: ApiRequest): Record<string, unknown> {
  return redactSecrets({
    method: request.method,
    path: request.path,
    pathParams: request.pathParams,
    query: request.query,
    headers: request.headers,
    body: request.body,
    credentials: request.credentials?.map((credential) => ({
      id: credential.id,
      pluginId: credential.pluginId,
      type: credential.type,
      scope: credential.scope,
      value: "[REDACTED]"
    }))
  }) as Record<string, unknown>;
}
