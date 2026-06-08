import { describe, expect, it } from "vitest";
import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "./index.js";

const fixtures = {
  "https://example.com/": `
    <html>
      <head><title>Hello</title><link rel="canonical" href="https://example.com/"></head>
      <body><article><h1>Hello MCP</h1><p>${"Useful article content. ".repeat(20)}</p></article></body>
    </html>
  `,
  "https://news.example.net/story/launch": `
    <html>
      <head><title>Launch</title><link rel="canonical" href="https://news.example.net/story/launch"></head>
      <body><main><h1>Launch News</h1><p>${"Newsroom body. ".repeat(20)}</p></main></body>
    </html>
  `,
  "https://blog.example.io/posts/one": `
    <html>
      <head><title>Blog</title><link rel="canonical" href="https://blog.example.io/posts/one"></head>
      <body><article><h1>Blog One</h1><p>${"Blog content. ".repeat(20)}</p></article></body>
    </html>
  `
};

describe("ExtractionService", () => {
  it("refreshes a custom route source and persists items", async () => {
    const repo = createSeedRepository();
    const service = new ExtractionService(repo, new FixtureFetcher(fixtures));
    const result = await service.refreshSource("src_example_articles", { mode: "force" });

    expect(result.cacheStatus).toBe("refreshed");
    expect(result.items).toHaveLength(1);
    await expect(repo.listItems("src_example_articles")).resolves.toHaveLength(1);
    await expect(repo.getDocument(result.items[0].documentId)).resolves.toMatchObject({
      title: "Hello MCP"
    });
  });

  it("returns diagnostics when fetch fails", async () => {
    const repo = createSeedRepository();
    const service = new ExtractionService(repo, new FixtureFetcher({}));
    const result = await service.refreshSource("src_example_articles", { mode: "force" });

    expect(result.diagnostics[0].code).toBe("FETCH_BLOCKED");
    await expect(repo.getSource("src_example_articles")).resolves.toMatchObject({
      healthStatus: "failing",
      backoffUntil: expect.any(String)
    });
  });

  it("uses validated rules when no custom route is selected", async () => {
    const repo = createSeedRepository();
    const service = new ExtractionService(repo, new FixtureFetcher(fixtures));
    const result = await service.refreshSource("src_private_docs", {
      mode: "validate_only",
      url: "https://blog.example.io/posts/one"
    });

    expect(result.document?.title).toBe("Blog One");
    expect(result.items).toHaveLength(1);
  });
});
