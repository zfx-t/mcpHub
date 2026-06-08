import { describe, expect, it } from "vitest";
import type { Plugin, PluginTool } from "@mcphub/core";
import { evaluateToolPolicy } from "./engine.js";

const plugin: Plugin = {
  id: "admin",
  name: "Admin",
  version: "0.1.0",
  type: "api",
  description: "Admin API",
  enabled: true,
  config: {}
};

const readTool: PluginTool = {
  id: "admin.admin.users.list",
  pluginId: "admin",
  name: "admin.users.list",
  description: "List users",
  inputSchema: {},
  effect: "read",
  requiresConfirmation: false,
  credentialRefs: [],
  operation: { type: "http", method: "GET", path: "/users" },
  enabled: true
};

describe("evaluateToolPolicy", () => {
  it("allows enabled read tools", () => {
    expect(evaluateToolPolicy({ plugin, tool: readTool })).toEqual({ allowed: true, status: "allowed" });
  });

  it("denies disabled plugins and tools", () => {
    expect(evaluateToolPolicy({ plugin: { ...plugin, enabled: false }, tool: readTool })).toMatchObject({
      allowed: false,
      code: "PLUGIN_DISABLED"
    });
    expect(evaluateToolPolicy({ plugin, tool: { ...readTool, enabled: false } })).toMatchObject({
      allowed: false,
      code: "TOOL_DISABLED"
    });
  });

  it("allows write tools by default", () => {
    const tool = { ...readTool, name: "admin.users.update", effect: "write" as const };

    expect(evaluateToolPolicy({ plugin, tool })).toEqual({ allowed: true, status: "allowed" });
  });

  it("uses dangerousMode with auditOnly default", () => {
    const tool = { ...readTool, name: "admin.users.disable", effect: "dangerous" as const, requiresConfirmation: true };

    expect(evaluateToolPolicy({ plugin, tool })).toEqual({ allowed: true, status: "allowed" });
    expect(evaluateToolPolicy({ plugin, tool, policy: { dangerousMode: "auditOnly" } })).toEqual({ allowed: true, status: "allowed" });
    expect(evaluateToolPolicy({ plugin, tool, policy: { dangerousMode: "allow" } })).toEqual({ allowed: true, status: "allowed" });
    expect(evaluateToolPolicy({ plugin, tool, policy: { dangerousMode: "block" } })).toMatchObject({
      allowed: false,
      code: "CONFIRMATION_REQUIRED"
    });
  });

  it("enforces host, method, and path restrictions", () => {
    expect(
      evaluateToolPolicy({
        plugin,
        tool: readTool,
        target: { url: "https://evil.local/users", method: "GET", path: "/users" },
        policy: { allowedHosts: ["admin.local"], allowedMethods: ["GET"], allowedPathPatterns: ["/users"] }
      })
    ).toMatchObject({ allowed: false, code: "POLICY_DENIED" });

    expect(
      evaluateToolPolicy({
        plugin,
        tool: readTool,
        target: { url: "https://admin.local/users/1", method: "GET", path: "/users/1" },
        policy: { allowedHosts: ["admin.local"], allowedMethods: ["GET"], allowedPathPatterns: ["/users/*"] }
      })
    ).toEqual({ allowed: true, status: "allowed" });
  });
});
