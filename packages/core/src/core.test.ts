import { describe, expect, it } from "vitest";
import {
  detectSource,
  normalizeUrl,
  platformErrorCodeSchema,
  pluginManifestSchema,
  ruleSchema,
  sourceMatchesUrl,
  toolEffectSchema,
  toResourceUri
} from "./index.js";
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

describe("platform schemas", () => {
  it("accepts valid plugin manifests", () => {
    expect(
      pluginManifestSchema.parse({
        id: "admin-users",
        name: "Admin Users",
        version: "0.1.0",
        type: "api",
        description: "Expose admin user APIs as MCP tools.",
        credentials: [{ id: "admin-token", type: "bearer" }],
        tools: [
          {
            name: "admin.users.list",
            description: "List users.",
            inputSchema: { type: "object", properties: { page: { type: "number" } } },
            effect: "read",
            credentialRefs: ["admin-token"],
            operation: { type: "http", method: "GET", path: "/api/users" }
          },
          {
            name: "admin.users.disable",
            description: "Disable a user.",
            inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
            effect: "dangerous",
            requiresConfirmation: true
          }
        ]
      })
    ).toMatchObject({
      id: "admin-users",
      tools: expect.arrayContaining([
        expect.objectContaining({ effect: "read", operation: { type: "http", method: "GET", path: "/api/users" } })
      ])
    });
  });

  it("accepts all platform tool effects and platform error codes", () => {
    expect(["read", "write", "dangerous"].map((effect) => toolEffectSchema.parse(effect))).toEqual([
      "read",
      "write",
      "dangerous"
    ]);
    expect(platformErrorCodeSchema.parse("CONFIRMATION_REQUIRED")).toBe("CONFIRMATION_REQUIRED");
    expect(platformErrorCodeSchema.parse("REMOTE_HTTP_ERROR")).toBe("REMOTE_HTTP_ERROR");
  });

  it("rejects invalid tool effects", () => {
    expect(() => toolEffectSchema.parse("side_effect")).toThrow();
  });

  it("rejects unknown credential references in plugin tools", () => {
    expect(() =>
      pluginManifestSchema.parse({
        id: "admin-users",
        name: "Admin Users",
        version: "0.1.0",
        type: "api",
        description: "Unknown credential ref.",
        credentials: [{ id: "admin-token", type: "bearer" }],
        tools: [
          {
            name: "admin.users.list",
            description: "List users.",
            inputSchema: {},
            effect: "read",
            credentialRefs: ["missing-token"]
          }
        ]
      })
    ).toThrow(/Unknown credential reference/);
  });

  it("rejects invalid plugin and tool names", () => {
    expect(() =>
      pluginManifestSchema.parse({
        id: "Admin Users",
        name: "Admin Users",
        version: "0.1.0",
        type: "api",
        description: "Bad plugin id.",
        tools: [{ name: "Users.list", description: "Bad tool name.", inputSchema: {}, effect: "read" }]
      })
    ).toThrow();
  });

  it("rejects duplicate tool names in a plugin manifest", () => {
    const tool = {
      name: "admin.users.list",
      description: "List users.",
      inputSchema: {},
      effect: "read"
    };
    expect(() =>
      pluginManifestSchema.parse({
        id: "admin-users",
        name: "Admin Users",
        version: "0.1.0",
        type: "api",
        description: "Duplicate tools.",
        tools: [tool, tool]
      })
    ).toThrow(/Duplicate tool name/);
  });

  it("accepts the validated rule type", () => {
    expect(
      ruleSchema.parse({
        id: "rule_private_docs_v1",
        sourceId: "src_private_docs",
        type: "validated",
        version: 1,
        urlPattern: "domain:private.example.org",
        fieldMappings: { title: "h1" },
        sampleUrls: ["https://private.example.org/docs/a"],
        confidence: 0.8,
        status: "active"
      })
    ).toMatchObject({ type: "validated" });
  });
});
