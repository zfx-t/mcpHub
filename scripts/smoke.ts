import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import { createApp } from "../apps/server/src/app.js";
import { loadConfig } from "../apps/server/src/config.js";

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
const extraction = new ExtractionService(
  repo,
  new FixtureFetcher({
    "https://example.com/": articleHtml
  })
);
const app = createApp({
  repository: repo,
  extraction,
  config: loadConfig({
    PUBLIC_BASE_URL: "http://127.0.0.1:0",
    MCP_SERVER_URL: "http://127.0.0.1:0/mcp",
    REQUEST_LOGGING: "false"
  })
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

  console.log("Smoke test passed");
} finally {
  await app.close();
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
