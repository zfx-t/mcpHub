import { describe, expect, it } from "vitest";
import { detectSource, normalizeUrl, sourceMatchesUrl, toResourceUri } from "./index.js";
import type { Source } from "./types.js";

const source: Source = {
  id: "src_example",
  name: "Example",
  description: "Example source",
  urlPattern: "domain:example.com",
  routeKey: "articles",
  owner: "system",
  visibility: "public",
  refreshPolicy: { ttlSeconds: 300 },
  authRequirement: "none",
  riskFlags: [],
  healthStatus: "healthy",
  failureCount: 0
};

describe("core url helpers", () => {
  it("normalizes URLs and strips tracking parameters", () => {
    expect(normalizeUrl("https://Example.com/path/?b=2&utm_source=x&a=1#frag")).toBe(
      "https://example.com/path?a=1&b=2"
    );
  });

  it("builds MCP resource URIs", () => {
    expect(toResourceUri("sources", "src_example", "items")).toBe("webmcp://sources/src_example/items");
  });
});

describe("source matching", () => {
  it("matches domain sources", () => {
    expect(sourceMatchesUrl(source, "https://www.example.com/news")).toBe(true);
  });

  it("returns available detection for public supported sources", () => {
    expect(
      detectSource(
        { url: "https://example.com/news", hostname: "example.com" },
        [source],
        { mcpServerUrl: "http://localhost:3000/mcp" }
      )
    ).toMatchObject({
      status: "available",
      sourceId: "src_example",
      resourceUri: "webmcp://sources/src_example"
    });
  });
});
