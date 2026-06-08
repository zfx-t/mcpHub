import { describe, expect, it } from "vitest";
import {
  detectSource,
  normalizeUrl,
  platformErrorCodeSchema,
  pluginManifestSchema,
  validatePluginStandard,
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
        homepage: "https://example.com/admin",
        author: "MCPHub",
        license: "MIT",
        tags: ["admin", "users"],
        mcphub: {
          minVersion: "0.1.0",
          capabilities: ["http", "credentials", "policy"]
        },
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
            requiresConfirmation: true,
            operation: { type: "http", method: "POST", path: "/api/users/{id}/disable" }
          }
        ]
      })
    ).toMatchObject({
      id: "admin-users",
      mcphub: {
        minVersion: "0.1.0",
        capabilities: ["http", "credentials", "policy"]
      },
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
            credentialRefs: ["missing-token"],
            operation: { type: "http", method: "GET", path: "/api/users" }
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
        tools: [
          {
            name: "Users.list",
            description: "Bad tool name.",
            inputSchema: {},
            effect: "read",
            operation: { type: "http", method: "GET", path: "/api/users" }
          }
        ]
      })
    ).toThrow();
  });

  it("accepts underscore plugin ids", () => {
    const manifest = pluginManifestSchema.parse({
      id: "admin_users",
      name: "Admin Users",
      version: "0.1.0",
      type: "api",
      description: "Underscore plugin id.",
      tools: [
        {
          name: "admin.users.list",
          description: "List users.",
          inputSchema: {},
          effect: "read",
          operation: { type: "http", method: "GET", path: "/api/users" }
        }
      ]
    });

    expect(manifest.id).toBe("admin_users");
  });

  it("rejects duplicate tool names in a plugin manifest", () => {
    const tool = {
      name: "admin.users.list",
      description: "List users.",
      inputSchema: {},
      effect: "read",
      operation: { type: "http", method: "GET", path: "/api/users" }
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

  it("accepts HTTP-only plugin tools", () => {
    const manifest = pluginManifestSchema.parse({
      id: "http-tools",
      name: "HTTP Tools",
      version: "0.1.0",
      type: "api",
      description: "HTTP tool.",
      tools: [
        {
          name: "http.users.list",
          description: "List users.",
          inputSchema: {},
          effect: "read",
          operation: { type: "http", method: "GET", path: "/api/users" }
        }
      ]
    });

    expect(manifest.tools[0]).toMatchObject({
      operation: { type: "http", method: "GET", path: "/api/users" }
    });
  });

  it("accepts executor-only plugin tools", () => {
    const manifest = pluginManifestSchema.parse({
      id: "executor-tools",
      name: "Executor Tools",
      version: "0.1.0",
      type: "custom",
      description: "Executor tool.",
      tools: [
        {
          name: "workflow.upload.video",
          description: "Upload video.",
          inputSchema: {},
          effect: "write",
          executor: { type: "module", handler: "uploadVideo" }
        }
      ]
    });

    expect(manifest.tools[0]).toMatchObject({
      executor: { type: "module", handler: "uploadVideo" }
    });
  });

  it("rejects plugin tools with both HTTP operation and executor", () => {
    expect(() =>
      pluginManifestSchema.parse({
        id: "bad-tools",
        name: "Bad Tools",
        version: "0.1.0",
        type: "custom",
        description: "Bad tool.",
        tools: [
          {
            name: "bad.tools.dual",
            description: "Invalid tool.",
            inputSchema: {},
            effect: "write",
            operation: { type: "http", method: "POST", path: "/api/do" },
            executor: { type: "module", handler: "doWork" }
          }
        ]
      })
    ).toThrow(/either operation or executor, not both/);
  });

  it("rejects plugin tools with neither HTTP operation nor executor", () => {
    expect(() =>
      pluginManifestSchema.parse({
        id: "missing-mode",
        name: "Missing Mode",
        version: "0.1.0",
        type: "custom",
        description: "Missing mode.",
        tools: [
          {
            name: "bad.tools.missing",
            description: "Invalid tool.",
            inputSchema: {},
            effect: "read"
          }
        ]
      })
    ).toThrow(/must define either operation or executor/);
  });

  it("reports standard compatibility warnings for missing metadata", () => {
    const manifest = pluginManifestSchema.parse({
      id: "legacy-plugin",
      name: "Legacy Plugin",
      version: "0.1.0",
      type: "api",
      description: "Legacy plugin without compatibility metadata.",
      tools: [
        {
          name: "legacy.items.list",
          description: "List items.",
          inputSchema: { type: "object", properties: {} },
          effect: "read",
          operation: { type: "http", method: "GET", path: "/items" }
        }
      ]
    });

    expect(validatePluginStandard(manifest)).toMatchObject({
      compatible: true,
      warnings: 1,
      errors: 0,
      diagnostics: [expect.objectContaining({ code: "PLUGIN_COMPATIBILITY_WARNING", severity: "warning" })]
    });
  });

  it("rejects unsupported standard capabilities", () => {
    const manifest = pluginManifestSchema.parse({
      id: "future-plugin",
      name: "Future Plugin",
      version: "0.1.0",
      type: "custom",
      description: "Future plugin.",
      mcphub: {
        minVersion: "0.1.0",
        capabilities: ["executor"]
      },
      tools: [
        {
          name: "future.jobs.run",
          description: "Run job.",
          inputSchema: { type: "object", properties: {} },
          effect: "write",
          executor: { type: "module", handler: "runJob" }
        }
      ]
    });

    expect(validatePluginStandard(manifest, { supportedCapabilities: ["http"] })).toMatchObject({
      compatible: false,
      warnings: 0,
      errors: 1,
      diagnostics: [expect.objectContaining({ code: "PLUGIN_COMPATIBILITY_ERROR", severity: "error" })]
    });
  });

  it("reports standard errors for non-object input schemas", () => {
    const manifest = pluginManifestSchema.parse({
      id: "bad-input",
      name: "Bad Input",
      version: "0.1.0",
      type: "api",
      description: "Bad input schema.",
      mcphub: {
        minVersion: "0.1.0",
        capabilities: ["http"]
      },
      tools: [
        {
          name: "bad.items.list",
          description: "List items.",
          inputSchema: { type: "string" },
          effect: "read",
          operation: { type: "http", method: "GET", path: "/items" }
        }
      ]
    });

    expect(validatePluginStandard(manifest)).toMatchObject({
      compatible: false,
      errors: 1,
      diagnostics: [expect.objectContaining({ code: "PLUGIN_MANIFEST_INVALID", path: "tools.0.inputSchema" })]
    });
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
