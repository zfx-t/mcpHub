export interface SmokeOptions {
  baseUrl: string;
  expectPostgres?: boolean;
  expectPlugins?: boolean;
  expectedPluginTool?: string;
  auditToolCall?: {
    name: string;
    arguments: Record<string, unknown>;
    expectText: string;
  };
}

export async function runRunningInstanceSmoke(options: SmokeOptions): Promise<void> {
  const baseUrl = options.baseUrl.replace(/\/+$/, "");
  const health = await getJson(`${baseUrl}/healthz`);
  assertStatus(health.status, 200, "healthz status");
  assertEqual(health.body.service, "mcphub", "healthz service");

  const status = await getJson(`${baseUrl}/api/status`);
  assertStatus(status.status, 200, "status API status");
  assertEqual(status.body.service, "mcphub", "status API service");
  assertIncludes(status.body, "mcphub://status", "status API includes status resource");
  if (options.expectPostgres) {
    assertEqual(status.body.repository?.mode, "postgres", "status API repository mode");
    assertEqual(status.body.repository?.databaseConfigured, true, "status API database configured");
  }

  const initialize = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "mcphub-smoke", version: "0.1.0" }
    }
  });
  assertStatus(initialize.status, 200, "MCP initialize status");

  const resources = await postJson(`${baseUrl}/mcp`, { jsonrpc: "2.0", id: 1, method: "resources/list", params: {} });
  assertStatus(resources.status, 200, "MCP resources/list status");
  assertIncludes(resources.body, "mcphub://status", "MCP resources/list includes status");

  const tools = await postJson(`${baseUrl}/mcp`, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assertStatus(tools.status, 200, "MCP tools/list status");
  assertIncludes(tools.body, "source.search", "MCP tools/list includes source.search");

  const statusResource = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 3,
    method: "resources/read",
    params: { uri: "mcphub://status" }
  });
  assertStatus(statusResource.status, 200, "MCP status resource status");
  assertIncludes(mcpText(statusResource.body), "mcphub://status", "MCP status resource includes status URI");

  if (options.expectPlugins) {
    const plugins = await getJson(`${baseUrl}/api/plugins`);
    assertStatus(plugins.status, 200, "plugins API status");
    if (!Array.isArray(plugins.body.plugins) || plugins.body.plugins.length === 0) {
      throw new Error("plugins API expected at least one loaded plugin");
    }
    assertIncludes(resources.body, "mcphub://plugins", "MCP resources/list includes plugins resource");
    assertIncludes(resources.body, "mcphub://audit/recent", "MCP resources/list includes audit resource");
    if (options.expectedPluginTool) {
      assertIncludes(tools.body, options.expectedPluginTool, `MCP tools/list includes ${options.expectedPluginTool}`);
    }
  }

  if (options.auditToolCall) {
    const toolCall = await postJson(`${baseUrl}/mcp`, {
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: { name: options.auditToolCall.name, arguments: options.auditToolCall.arguments }
    });
    assertStatus(toolCall.status, 200, `${options.auditToolCall.name} status`);
    assertIncludes(mcpText(toolCall.body), options.auditToolCall.expectText, `${options.auditToolCall.name} expected result`);

    const audit = await postJson(`${baseUrl}/mcp`, {
      jsonrpc: "2.0",
      id: 5,
      method: "resources/read",
      params: { uri: "mcphub://audit/recent" }
    });
    assertStatus(audit.status, 200, "MCP audit resource status");
    assertIncludes(mcpText(audit.body), options.auditToolCall.name, "MCP audit resource includes tool call");
    assertIncludes(mcpText(audit.body), options.auditToolCall.expectText, "MCP audit resource includes expected audit evidence");
  }
}

export async function getJson(url: string): Promise<{ status: number; body: any }> {
  const response = await fetch(url, {
    method: "GET",
    headers: { accept: "application/json" }
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

export async function postJson(url: string, payload: unknown): Promise<{ status: number; body: any }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  try {
    return { status: response.status, body: JSON.parse(text) };
  } catch {
    return { status: response.status, body: text };
  }
}

export function assertStatus(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

export function assertIncludes(value: unknown, expected: string, label: string): void {
  const actual = stringifyForAssertion(value);
  if (!actual.includes(expected)) {
    throw new Error(`${label}: expected body to include ${expected}. Actual: ${actual.slice(0, 1000)}`);
  }
}

export function assertNotIncludes(value: unknown, unexpected: string, label: string): void {
  const actual = stringifyForAssertion(value);
  if (actual.includes(unexpected)) {
    throw new Error(`${label}: expected body not to include ${unexpected}`);
  }
}

export function stringifyForAssertion(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

export function mcpText(body: unknown): string {
  if (typeof body === "string" && body.startsWith("event:")) {
    const dataLine = body
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.startsWith("data: "));
    if (dataLine) {
      try {
        return mcpText(JSON.parse(dataLine.slice("data: ".length)));
      } catch {
        return body;
      }
    }
  }
  if (!body || typeof body !== "object") {
    return stringifyForAssertion(body);
  }
  const record = body as {
    result?: {
      content?: Array<{ text?: string }>;
      contents?: Array<{ text?: string }>;
    };
  };
  const contentText = record.result?.content?.map((entry) => entry.text ?? "").join("\n");
  if (contentText) {
    return contentText;
  }
  const contentsText = record.result?.contents?.map((entry) => entry.text ?? "").join("\n");
  return contentsText || stringifyForAssertion(body);
}
