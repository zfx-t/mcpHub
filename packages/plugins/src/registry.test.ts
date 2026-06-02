import { describe, expect, it } from "vitest";
import { defineApiTool, definePlugin, PluginRegistry, sampleAdminPlugin, webContentPlugin } from "./index.js";

describe("plugin SDK", () => {
  it("defines API tools while preserving REST metadata", () => {
    expect(
      defineApiTool({
        name: "admin.users.list",
        description: "List users.",
        inputSchema: { type: "object" },
        effect: "read",
        method: "GET",
        path: "/api/users",
        credentialRefs: ["admin-token"]
      })
    ).toMatchObject({
      name: "admin.users.list",
      method: "GET",
      path: "/api/users",
      operation: { type: "http", method: "GET", path: "/api/users" },
      credentialRefs: ["admin-token"]
    });
  });
});

describe("PluginRegistry", () => {
  it("registers built-in and API plugin manifests", () => {
    const adminPlugin = definePlugin({
      id: "admin-users",
      name: "Admin Users",
      version: "0.1.0",
      type: "api",
      description: "Expose admin user APIs.",
      credentials: [{ id: "admin-token", type: "bearer" }],
      tools: [
        defineApiTool({
          name: "admin.users.list",
          description: "List users.",
          inputSchema: { type: "object" },
          effect: "read",
          method: "GET",
          path: "/api/users",
          credentialRefs: ["admin-token"]
        })
      ]
    });
    const registry = new PluginRegistry([webContentPlugin, adminPlugin]);

    expect(registry.listPlugins()).toEqual([
      expect.objectContaining({ id: "admin-users", type: "api" }),
      expect.objectContaining({ id: "web-content", type: "web_content" })
    ]);
    expect(registry.listPluginTools("admin-users")).toEqual([
      expect.objectContaining({
        name: "admin.users.list",
        credentialRefs: ["admin-token"],
        operation: { type: "http", method: "GET", path: "/api/users" }
      })
    ]);
    expect(registry.getPluginToolByName("source.refresh")).toMatchObject({ pluginId: "web-content", effect: "write" });
  });

  it("rejects duplicate plugin IDs", () => {
    expect(() => new PluginRegistry([webContentPlugin, webContentPlugin])).toThrow(/Duplicate plugin id/);
  });

  it("rejects duplicate tool names across plugins", () => {
    const first = definePlugin({
      id: "admin-users",
      name: "Admin Users",
      version: "0.1.0",
      type: "api",
      description: "Expose admin users.",
      tools: [{ name: "admin.users.list", description: "List users.", inputSchema: {}, effect: "read" }]
    });
    const second = definePlugin({
      id: "admin-users-copy",
      name: "Admin Users Copy",
      version: "0.1.0",
      type: "api",
      description: "Expose duplicate admin users.",
      tools: [{ name: "admin.users.list", description: "List users again.", inputSchema: {}, effect: "read" }]
    });
    expect(() => new PluginRegistry([first, second])).toThrow(/Duplicate plugin tool name/);
  });

  it("validates API-specific method and path fields at runtime", () => {
    expect(() =>
      defineApiTool({
        name: "admin.users.list",
        description: "List users.",
        inputSchema: {},
        effect: "read",
        method: "TRACE" as any,
        path: "/api/users"
      })
    ).toThrow(/Unsupported HTTP method/);
    expect(() =>
      defineApiTool({
        name: "admin.users.list",
        description: "List users.",
        inputSchema: {},
        effect: "read",
        method: "GET",
        path: "api/users"
      })
    ).toThrow(/must start/);
  });

  it("ships a sample admin API plugin for MCP adapter tests", () => {
    const registry = new PluginRegistry([sampleAdminPlugin]);

    expect(registry.listPluginTools()).toEqual([
      expect.objectContaining({ name: "admin.users.disable", effect: "dangerous", operation: expect.objectContaining({ method: "POST" }) }),
      expect.objectContaining({ name: "admin.users.list", effect: "read", operation: expect.objectContaining({ method: "GET" }) })
    ]);
  });
});
