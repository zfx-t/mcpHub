import { DEFAULT_PROTOCOL_VERSION, DEFAULT_TIMEOUT_MS } from "./common.js";

export interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
}

export interface JsonRpcFailure {
  jsonrpc?: "2.0";
  id?: number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export type JsonRpcResponse = JsonRpcSuccess | JsonRpcFailure;

export class McpClientError extends Error {
  constructor(
    message: string,
    public readonly code = "MCP_CLIENT_ERROR",
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "McpClientError";
  }
}

export interface McpHttpClientOptions {
  endpoint: string;
  protocolVersion?: string;
  clientName?: string;
  clientVersion?: string;
  timeoutMs?: number;
}

export class McpHttpClient {
  private nextId = 1;
  private initialized = false;
  private sessionId: string | undefined;

  constructor(private readonly options: McpHttpClientOptions) {}

  async initialize(): Promise<unknown> {
    const result = await this.request("initialize", {
      protocolVersion: this.options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: this.options.clientName ?? "mcphub-generic-client",
        version: this.options.clientVersion ?? "0.1.0"
      }
    });
    this.initialized = true;
    return result;
  }

  async notifyInitialized(): Promise<void> {
    if (!this.initialized) {
      return;
    }
    try {
      await this.post({
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {}
      });
    } catch {
      // Some stateless transports do not need or return a response for notifications.
    }
  }

  async request(method: string, params: unknown = {}): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;
    const response = await this.post({
      jsonrpc: "2.0",
      id,
      method,
      params
    });
    const parsed = parseHttpMcpResponse(response, id);
    if ("error" in parsed) {
      throw jsonRpcError(method, parsed);
    }
    return parsed.result;
  }

  private async post(payload: unknown): Promise<{ body: string; contentType: string; status: number }> {
    let response: Response;
    let body: string;
    let contentType: string;
    const controller = new AbortController();
    const timeoutMs = this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        accept: "application/json, text/event-stream"
      };
      if (this.sessionId) {
        headers["mcp-session-id"] = this.sessionId;
      }
      response = await fetch(this.options.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      body = await response.text();
      contentType = response.headers.get("content-type") ?? "";
    } catch (error) {
      if (controller.signal.aborted) {
        throw new McpClientError(
          `Timed out after ${timeoutMs}ms while waiting for ${redactText(this.options.endpoint)}.`,
          "NETWORK_TIMEOUT",
          { timeoutMs }
        );
      }
      throw new McpClientError(
        `Network failure while connecting to ${redactText(this.options.endpoint)}. Check that MCPHub is running and --url points to /mcp.`,
        "NETWORK_FAILURE",
        error instanceof Error ? error.message : error
      );
    } finally {
      clearTimeout(timeout);
    }

    const sessionId = response.headers.get("mcp-session-id");
    if (sessionId) {
      this.sessionId = sessionId;
    }
    if (!response.ok) {
      throw httpStatusError(response.status, this.options.endpoint, contentType, body);
    }
    return { body, contentType, status: response.status };
  }
}

export function parseHttpMcpResponse(response: { body: string; contentType: string; status: number }, expectedId?: number): JsonRpcResponse {
  try {
    return parseMcpResponse(response.body, response.contentType, expectedId);
  } catch (error) {
    if (error instanceof McpClientError && error.code === "RESPONSE_PARSE_ERROR") {
      throw new McpClientError(
        `Failed to parse MCP response. HTTP ${response.status}; content-type: ${response.contentType || "unknown"}; body: ${excerpt(response.body)}`,
        "RESPONSE_PARSE_ERROR",
        { status: response.status, contentType: response.contentType, body: excerpt(response.body), cause: error.message }
      );
    }
    throw error;
  }
}

export function parseMcpResponse(body: string, contentType: string, expectedId?: number): JsonRpcResponse {
  const trimmed = body.trim();
  if (contentType.includes("text/event-stream") || trimmed.startsWith("event:") || trimmed.startsWith("data:")) {
    return parseEventStreamResponse(body, expectedId);
  }
  return parseJsonRpcResponse(trimmed, expectedId);
}

export function parseEventStreamResponse(body: string, expectedId?: number): JsonRpcResponse {
  const dataLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trim())
    .filter(Boolean);

  for (const data of dataLines) {
    const response = parseJsonRpcResponse(data, undefined);
    if (expectedId === undefined || response.id === expectedId || response.id === null) {
      return response;
    }
  }
  throw new McpClientError("Malformed event-stream response. No matching JSON-RPC data event found.", "RESPONSE_PARSE_ERROR", excerpt(body));
}

export function parseJsonRpcResponse(body: string, expectedId?: number): JsonRpcResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new McpClientError("Failed to parse JSON-RPC response.", "RESPONSE_PARSE_ERROR", excerpt(body));
  }
  if (!parsed || typeof parsed !== "object") {
    throw new McpClientError("Invalid JSON-RPC response shape.", "RESPONSE_PARSE_ERROR", excerpt(body));
  }
  const record = parsed as Partial<JsonRpcSuccess & JsonRpcFailure>;
  if (expectedId !== undefined && record.id !== expectedId && record.id !== null) {
    throw new McpClientError(`JSON-RPC response id mismatch. Expected ${expectedId}, got ${String(record.id)}.`, "RESPONSE_PARSE_ERROR");
  }
  if (record.error) {
    return record as JsonRpcFailure;
  }
  if (!("result" in record)) {
    throw new McpClientError("Invalid JSON-RPC response. Missing result or error.", "RESPONSE_PARSE_ERROR", excerpt(body));
  }
  return record as JsonRpcSuccess;
}

function jsonRpcError(method: string, response: JsonRpcFailure): McpClientError {
  const data = response.error.data;
  const dataText = data === undefined ? "" : ` Data: ${safeStringify(redactSecrets(data))}`;
  const safeMessage = redactText(response.error.message);
  const guidance = guidanceForJsonRpcFailure(method, safeMessage);
  return new McpClientError(
    `MCP ${method} failed with JSON-RPC error ${response.error.code}: ${safeMessage}.${dataText}${guidance}`,
    "JSON_RPC_ERROR",
    redactSecrets(response.error)
  );
}

function guidanceForJsonRpcFailure(method: string, message: string): string {
  const lower = message.toLowerCase();
  if (method === "tools/call" && (lower.includes("not found") || lower.includes("unknown") || lower.includes("missing"))) {
    return " Run list-tools to see available tool names.";
  }
  if (method === "resources/read" && (lower.includes("not found") || lower.includes("unknown") || lower.includes("missing"))) {
    return " Run list-resources to see available resource URIs.";
  }
  if (method === "initialize") {
    return " MCP handshake failed; check the requested protocol version.";
  }
  return "";
}

function httpStatusError(status: number, endpoint: string, contentType: string, body: string): McpClientError {
  if (status === 404 || status === 405) {
    return new McpClientError(
      `MCP endpoint returned HTTP ${status}. Check that --url points to the MCP endpoint, usually ending with /mcp.`,
      "HTTP_ENDPOINT_ERROR",
      { status, endpoint: redactText(endpoint), contentType, body: excerpt(body) }
    );
  }
  if (status === 429) {
    return new McpClientError("MCP endpoint returned HTTP 429. The server rate limit was reached.", "HTTP_RATE_LIMITED", {
      status,
      endpoint: redactText(endpoint),
      contentType,
      body: excerpt(body)
    });
  }
  return new McpClientError(`MCP endpoint returned HTTP ${status}. Body: ${excerpt(body)}`, "HTTP_ERROR", {
    status,
    endpoint: redactText(endpoint),
    contentType
  });
}

function excerpt(value: string, length = 500): string {
  const compact = redactText(value).replace(/\s+/g, " ").trim();
  return compact.length > length ? `${compact.slice(0, length)}...` : compact;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const sensitiveKeyPattern = /token|secret|password|authorization|cookie|api[_-]?key/i;
const sensitiveTextPattern = /((?:token|secret|password|authorization|cookie|api[_-]?key)=)[^&\s]+/gi;
const bearerPattern = /(bearer\s+)[a-z0-9._~+/=-]+/gi;

function redactSecrets(value: unknown): unknown {
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

function redactText(value: string): string {
  return value.replace(sensitiveTextPattern, "$1[REDACTED]").replace(bearerPattern, "$1[REDACTED]");
}
