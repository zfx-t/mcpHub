import { describe, expect, it } from "vitest";
import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";

describe("server app", () => {
  it("detects supported and restricted sites", async () => {
    const repo = createSeedRepository();
    const app = createApp({
      repository: repo,
      extraction: new ExtractionService(repo, new FixtureFetcher({})),
      config: loadConfig({
        PUBLIC_BASE_URL: "http://localhost:3000",
        MCP_SERVER_URL: "http://localhost:3000/mcp",
        REQUEST_LOGGING: "false"
      })
    });

    const supported = await app.inject({
      method: "POST",
      url: "/api/detect-site",
      payload: { url: "https://example.com/articles/hello", hostname: "example.com" }
    });
    expect(supported.statusCode).toBe(200);
    expect(supported.json()).toMatchObject({ status: "available", sourceId: "src_example_articles" });

    const restricted = await app.inject({
      method: "POST",
      url: "/api/detect-site",
      payload: { url: "https://private.example.org/docs/a", hostname: "private.example.org" }
    });
    expect(restricted.json()).toMatchObject({ status: "restricted" });
  });

  it("handles MCP JSON-RPC tool calls", async () => {
    const repo = createSeedRepository();
    const app = createApp({
      repository: repo,
      extraction: new ExtractionService(
        repo,
        new FixtureFetcher({
          "https://example.com/articles/hello": `<article><h1>Hello MCP</h1><p>${"Content. ".repeat(30)}</p></article>`
        })
      ),
      config: loadConfig({ REQUEST_LOGGING: "false" })
    });

    await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { accept: "application/json, text/event-stream" },
      payload: {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0.1.0" }
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { accept: "application/json, text/event-stream" },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "source.refresh", arguments: { sourceId: "src_example_articles", mode: "force" } }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("cacheStatus");
    await expect(repo.listItems("src_example_articles")).resolves.toHaveLength(1);
  });
});
