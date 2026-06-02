import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import { createApp } from "../apps/server/src/app.js";
import { loadConfig } from "../apps/server/src/config.js";
import { createPlatformServices } from "../apps/server/src/platform.js";

const articleHtml = `
  <html>
    <head>
      <title>Hello MCP</title>
      <link rel="canonical" href="https://example.com/">
      <meta name="description" content="Smoke test article">
    </head>
    <body>
      <article>
        <h1>Hello MCP</h1>
        <p>${"Smoke test content. ".repeat(40)}</p>
      </article>
    </body>
  </html>
`;

const repo = createSeedRepository();
let disableCalls = 0;
const adminServer = await startFixtureServer(async (request, response) => {
  if (request.url?.startsWith("/api/users") && request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ users: [{ id: "user-1", name: "Ada" }], authorization: request.headers.authorization }));
    return;
  }
  if (request.url?.startsWith("/api/users/user-1/disable")) {
    disableCalls += 1;
    response.statusCode = 204;
    response.end();
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});
const smokeEnv = {
  PUBLIC_BASE_URL: "http://127.0.0.1:0",
  MCP_SERVER_URL: "http://127.0.0.1:0/mcp",
  REQUEST_LOGGING: "false",
  SAMPLE_ADMIN_API_BASE_URL: adminServer.baseUrl,
  SAMPLE_ADMIN_API_TOKEN_ENV: "SAMPLE_ADMIN_API_TOKEN",
  SAMPLE_ADMIN_API_TOKEN: "secret-token"
};
const config = loadConfig(smokeEnv);
const extraction = new ExtractionService(
  repo,
  new FixtureFetcher({
    "https://example.com/": articleHtml
  })
);
const app = createApp({
  repository: repo,
  extraction,
  config,
  platform: await createPlatformServices({ repository: repo, config, env: smokeEnv })
});

await app.listen({ host: "127.0.0.1", port: 0 });
const address = app.server.address();
if (!address || typeof address === "string") {
  throw new Error("Unable to determine smoke server address");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const detect = await postJson(`${baseUrl}/api/detect-site`, {
    url: "https://example.com/articles/hello",
    hostname: "example.com",
    title: "Hello MCP",
    canonicalUrl: "https://example.com/articles/hello",
    metaDescription: "Smoke test article",
    language: "en"
  });
  assertStatus(detect.status, 200, "detect status");
  assertEqual(detect.body.status, "available", "detect result");

  const init = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0.1.0" }
    }
  });
  assertStatus(init.status, 200, "initialize status");

  const list = await postJson(`${baseUrl}/mcp`, { jsonrpc: "2.0", id: 1, method: "resources/list", params: {} });
  assertStatus(list.status, 200, "resources/list status");

  const pluginList = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 11,
    method: "resources/read",
    params: { uri: "mcphub://plugins" }
  });
  assertStatus(pluginList.status, 200, "plugin list status");
  assertIncludes(pluginList.body, "sample-admin", "plugin list includes sample admin");

  const toolList = await postJson(`${baseUrl}/mcp`, { jsonrpc: "2.0", id: 12, method: "tools/list", params: {} });
  assertStatus(toolList.status, 200, "tools/list status");
  assertIncludes(toolList.body, "admin.users.list", "tools/list includes admin.users.list");

  const refresh = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "source.refresh", arguments: { sourceId: "src_example_articles", mode: "force" } }
  });
  assertStatus(refresh.status, 200, "source.refresh status");

  const items = await repo.listItems("src_example_articles");
  assertEqual(items.length, 1, "refreshed item count");

  const readItem = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 3,
    method: "resources/read",
    params: { uri: `webmcp://items/${items[0].id}` }
  });
  assertStatus(readItem.status, 200, "item read status");
  if (!String(readItem.body).includes("Hello MCP")) {
    throw new Error("item read did not include expected content");
  }

  const debug = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "debug.explain", arguments: { itemId: items[0].id } }
  });
  assertStatus(debug.status, 200, "debug.explain status");

  const adminUsers = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: { name: "admin.users.list", arguments: { page: 1 } }
  });
  assertStatus(adminUsers.status, 200, "admin.users.list status");
  assertIncludes(adminUsers.body, "Ada", "admin.users.list result");
  assertIncludes(adminUsers.body, "Bearer secret-token", "admin.users.list auth forwarding");

  const disable = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 14,
    method: "tools/call",
    params: { name: "admin.users.disable", arguments: { id: "user-1" } }
  });
  assertStatus(disable.status, 200, "admin.users.disable status");
  assertIncludes(disable.body, "CONFIRMATION_REQUIRED", "admin.users.disable confirmation block");
  assertEqual(disableCalls, 0, "dangerous remote call count");

  const audit = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 15,
    method: "resources/read",
    params: { uri: "mcphub://audit/recent" }
  });
  assertStatus(audit.status, 200, "audit recent status");
  assertIncludes(audit.body, "CONFIRMATION_REQUIRED", "audit recent contains blocked call");
  assertIncludes(audit.body, "user-1", "audit recent contains blocked call input");

  console.log("Smoke test passed");
} finally {
  await app.close();
  await adminServer.close();
}

async function postJson(url: string, payload: unknown): Promise<{ status: number; body: any }> {
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

function assertStatus(actual: number, expected: number, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${expected}, got ${actual}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertIncludes(value: unknown, expected: string, label: string): void {
  if (!String(value).includes(expected)) {
    throw new Error(`${label}: expected body to include ${expected}`);
  }
}

async function startFixtureServer(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind to a TCP port.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}
