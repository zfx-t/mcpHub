import { describe, expect, it } from "vitest";
import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import { WebMcpGateway } from "./index.js";

const fixtureHtml = `
  <html>
    <head><title>Hello</title><link rel="canonical" href="https://example.com/"></head>
    <body><article><h1>Hello MCP</h1><p>${"Gateway article content. ".repeat(20)}</p></article></body>
  </html>
`;

describe("WebMcpGateway", () => {
  it("lists and reads sources", async () => {
    const repo = createSeedRepository();
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})));

    expect(gateway.listResources()).toContainEqual(expect.objectContaining({ uri: "webmcp://sources" }));
    await expect(gateway.readResource("webmcp://sources")).resolves.toEqual([
      expect.objectContaining({ mimeType: "application/json" })
    ]);
  });

  it("refreshes sources through tools and reads items", async () => {
    const repo = createSeedRepository();
    const service = new ExtractionService(repo, new FixtureFetcher({ "https://example.com/": fixtureHtml }));
    const gateway = new WebMcpGateway(repo, service);

    await gateway.callTool("source.refresh", { sourceId: "src_example_articles", mode: "force" });
    const items = await repo.listItems("src_example_articles");

    expect(items).toHaveLength(1);
    await expect(gateway.readResource(`webmcp://items/${items[0].id}`)).resolves.toEqual([
      expect.objectContaining({ text: expect.stringContaining("Hello MCP") })
    ]);
  });
});
