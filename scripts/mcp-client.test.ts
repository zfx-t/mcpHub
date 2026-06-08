import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import { createApp } from "../apps/server/src/app.js";
import { loadConfig } from "../apps/server/src/config.js";
import { parseMcpClientArgs, McpClientCliError } from "./mcp-client/common.js";
import { McpHttpClient, parseEventStreamResponse, parseHttpMcpResponse, parseJsonRpcResponse } from "./mcp-client/client.js";
import { formatHumanOutput, runMcpClientCommand } from "./mcp-client/commands.js";

const closers: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(closers.splice(0).map((close) => close()));
});

describe("generic MCP client CLI", () => {
  it("parses inspect defaults and global options", () => {
    const options = parseMcpClientArgs(["--url", "http://localhost:3000/mcp", "--json", "inspect"]);

    expect(options).toMatchObject({
      command: "inspect",
      url: "http://localhost:3000/mcp",
      json: true,
      protocolVersion: "2025-11-25",
      timeoutMs: 10000
    });
  });

  it("parses timeout overrides", () => {
    expect(parseMcpClientArgs(["--timeout-ms", "2500", "inspect"]).timeoutMs).toBe(2500);
    expect(() => parseMcpClientArgs(["--timeout-ms", "0", "inspect"])).toThrow(McpClientCliError);
  });

  it("parses call-tool arguments as a JSON object", () => {
    const options = parseMcpClientArgs(["call-tool", "--name", "source.search", "--args", '{"query":"example"}']);

    expect(options.command).toBe("call-tool");
    expect(options.name).toBe("source.search");
    expect(options.args).toEqual({ query: "example" });
  });

  it("rejects invalid call-tool JSON arguments", () => {
    expect(() => parseMcpClientArgs(["call-tool", "--name", "source.search", "--args", "[]"])).toThrow(McpClientCliError);
    expect(() => parseMcpClientArgs(["call-tool", "--name", "source.search", "--args", "not-json"])).toThrow(McpClientCliError);
  });

  it("parses JSON-RPC success and errors", () => {
    expect(parseJsonRpcResponse('{"jsonrpc":"2.0","id":1,"result":{"ok":true}}', 1)).toMatchObject({
      id: 1,
      result: { ok: true }
    });
    expect(parseJsonRpcResponse('{"jsonrpc":"2.0","id":1,"error":{"code":-32601,"message":"missing"}}', 1)).toMatchObject({
      error: { code: -32601, message: "missing" }
    });
  });

  it("parses event-stream JSON-RPC responses", () => {
    const body = [
      "event: message",
      'data: {"jsonrpc":"2.0","id":3,"result":{"tools":[]}}',
      ""
    ].join("\n");

    expect(parseEventStreamResponse(body, 3)).toMatchObject({
      id: 3,
      result: { tools: [] }
    });
  });

  it("formats inspect output for humans", () => {
    const output = formatHumanOutput({
      command: "inspect",
      endpoint: "http://127.0.0.1:3000/mcp",
      summary: {
        initialize: "ok",
        resourceCount: 2,
        toolCount: 1,
        statusResource: "ok",
        platformStatus: "ok",
        repository: "memory",
        pluginsLoaded: 0
      }
    });

    expect(output).toContain("MCPHub generic client inspect");
    expect(output).toContain("Resources: 2");
    expect(output).toContain("Repository: memory");
  });

  it("reports endpoint errors with actionable guidance", async () => {
    const server = await startServer((request, response) => {
      void request;
      response.statusCode = 404;
      response.end("not found");
    });

    await expect(runMcpClientCommand(parseMcpClientArgs(["--url", `${server.baseUrl}/wrong`, "inspect"]))).rejects.toThrow(
      /usually ending with \/mcp/
    );
  });

  it("reports rate limit errors clearly", async () => {
    const server = await startServer((request, response) => {
      void request;
      response.statusCode = 429;
      response.end("slow down");
    });

    await expect(runMcpClientCommand(parseMcpClientArgs(["--url", `${server.baseUrl}/mcp`, "inspect"]))).rejects.toThrow(
      /rate limit was reached/
    );
  });

  it("reports malformed responses with status, content type, and body excerpt", () => {
    expect(() =>
      parseHttpMcpResponse(
        {
          status: 200,
          contentType: "text/plain",
          body: "this is not json"
        },
        1
      )
    ).toThrow(/HTTP 200; content-type: text\/plain; body: this is not json/);
  });

  it("redacts sensitive response excerpts and JSON-RPC error data", async () => {
    expect(() =>
      parseHttpMcpResponse(
        {
          status: 200,
          contentType: "text/plain",
          body: "authorization=Bearer secret-token"
        },
        1
      )
    ).toThrow(/authorization=\[REDACTED\]/);

    const errorServer = await startJsonRpcErrorServer("Tool missing bearer secret-token", { token: "secret-token" });
    await expect(
      runMcpClientCommand(parseMcpClientArgs(["--url", `${errorServer.baseUrl}/mcp`, "call-tool", "--name", "missing.tool"]))
    ).rejects.toThrow(/\[REDACTED\]/);
  });

  it("adds tool and resource discovery guidance for not-found errors", async () => {
    const toolServer = await startJsonRpcErrorServer("Tool missing");
    await expect(
      runMcpClientCommand(parseMcpClientArgs(["--url", `${toolServer.baseUrl}/mcp`, "call-tool", "--name", "missing.tool"]))
    ).rejects.toThrow(/Run list-tools/);

    const resourceServer = await startJsonRpcErrorServer("Resource not found");
    await expect(
      runMcpClientCommand(parseMcpClientArgs(["--url", `${resourceServer.baseUrl}/mcp`, "read-resource", "--uri", "mcphub://missing"]))
    ).rejects.toThrow(/Run list-resources/);
  });

  it("reports network failures with running-server guidance", async () => {
    const server = await startServer((request, response) => {
      void request;
      response.end("{}");
    });
    const url = `${server.baseUrl}/mcp`;
    await new Promise<void>((resolve, reject) => server.server.close((error) => (error ? reject(error) : resolve())));
    closers.pop();

    await expect(new McpHttpClient({ endpoint: url }).initialize()).rejects.toThrow(/Check that MCPHub is running/);
  });

  it("times out stalled responses", async () => {
    const server = await startServer((request, response) => {
      void request;
      void response;
      // Keep the connection open until the client aborts.
    });

    await expect(new McpHttpClient({ endpoint: `${server.baseUrl}/mcp`, timeoutMs: 20 }).initialize()).rejects.toThrow(/Timed out after 20ms/);
  });

  it("times out when headers are sent but the body never ends", async () => {
    const server = await startServer((request, response) => {
      void request;
      response.writeHead(200, { "content-type": "application/json" });
      response.write('{"jsonrpc":"2.0"');
    });

    await expect(new McpHttpClient({ endpoint: `${server.baseUrl}/mcp`, timeoutMs: 20 }).initialize()).rejects.toThrow(/Timed out after 20ms/);
  });

  it("preserves MCP session ids between requests", async () => {
    const seenSessionHeaders: string[] = [];
    const server = await startServer(async (request, response) => {
      let body = "";
      for await (const chunk of request) {
        body += String(chunk);
      }
      const parsed = JSON.parse(body) as { id?: number; method?: string };
      if (parsed.method !== "initialize") {
        seenSessionHeaders.push(String(request.headers["mcp-session-id"] ?? ""));
      }
      response.setHeader("Content-Type", "application/json");
      response.setHeader("Mcp-Session-Id", "session-1");
      response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: parsed.method === "tools/list" ? { tools: [] } : {} }));
    });
    const client = new McpHttpClient({ endpoint: `${server.baseUrl}/mcp` });

    await client.initialize();
    await client.request("tools/list", {});

    expect(seenSessionHeaders).toEqual(["session-1"]);
  });

  it("inspects and calls a running MCPHub instance through HTTP", async () => {
    const repository = createSeedRepository();
    const app = createApp({
      repository,
      extraction: new ExtractionService(
        repository,
        new FixtureFetcher({
          "https://example.com/": "<html><body><article><h1>Hello</h1><p>Example</p></article></body></html>"
        })
      ),
      config: loadConfig({
        PUBLIC_BASE_URL: "http://127.0.0.1:0",
        MCP_SERVER_URL: "http://127.0.0.1:0/mcp",
        REQUEST_LOGGING: "false"
      })
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    closers.push(() => app.close());
    const address = app.server.address();
    if (!address || typeof address === "string") {
      throw new Error("Unable to determine test server address");
    }
    const url = `http://127.0.0.1:${address.port}/mcp`;

    const inspect = await runMcpClientCommand(parseMcpClientArgs(["--url", url, "inspect"]));
    expect(inspect.summary).toMatchObject({
      initialize: "ok",
      statusResource: "ok"
    });
    expect(inspect.summary?.resourceCount).toBeGreaterThan(0);
    expect(inspect.summary?.toolCount).toBeGreaterThan(0);

    const tools = await runMcpClientCommand(parseMcpClientArgs(["--url", url, "list-tools"]));
    expect(JSON.stringify(tools.result)).toContain("source.search");

    const status = await runMcpClientCommand(parseMcpClientArgs(["--url", url, "read-resource", "--uri", "mcphub://status"]));
    expect(JSON.stringify(status.result)).toContain("mcphub://status");

    const call = await runMcpClientCommand(parseMcpClientArgs(["--url", url, "call-tool", "--name", "source.search", "--args", "{}"]));
    expect(JSON.stringify(call.result)).toContain("src_example_articles");
  });
});

type TestServerHandler = (request: IncomingMessage, response: ServerResponse) => void | Promise<void>;

async function startServer(handler: TestServerHandler): Promise<{ baseUrl: string; server: Server }> {
  const server = createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  closers.push(() => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve()))));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to determine server address");
  }
  return { server, baseUrl: `http://127.0.0.1:${address.port}` };
}

async function startJsonRpcErrorServer(message: string, data?: unknown): Promise<{ baseUrl: string; server: Server }> {
  return startServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) {
      body += String(chunk);
    }
    const parsed = JSON.parse(body) as { id?: number; method?: string };
    response.setHeader("Content-Type", "application/json");
    if (parsed.method === "initialize") {
      response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, result: { protocolVersion: "2025-11-25", capabilities: {} } }));
      return;
    }
    if (parsed.method === "notifications/initialized") {
      response.end("");
      return;
    }
    response.end(JSON.stringify({ jsonrpc: "2.0", id: parsed.id, error: { code: -32602, message, data } }));
  });
}
