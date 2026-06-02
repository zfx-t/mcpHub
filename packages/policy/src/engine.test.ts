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

  it("requires write grants", () => {
    const tool = { ...readTool, name: "admin.users.update", effect: "write" as const };

    expect(evaluateToolPolicy({ plugin, tool })).toMatchObject({ allowed: false, code: "POLICY_DENIED" });
    expect(evaluateToolPolicy({ plugin, tool, policy: { writeToolNames: ["admin.users.update"] } })).toEqual({
      allowed: true,
      status: "allowed"
    });
  });

  it("blocks dangerous tools without confirmation", () => {
    const tool = { ...readTool, name: "admin.users.disable", effect: "dangerous" as const, requiresConfirmation: true };

    expect(evaluateToolPolicy({ plugin, tool })).toMatchObject({ allowed: false, code: "CONFIRMATION_REQUIRED" });
    expect(
      evaluateToolPolicy({
        plugin,
        tool,
        confirmationToken: "confirmed",
        policy: { dangerousConfirmationTokens: { "admin.users.disable": "confirmed" } }
      })
    ).toEqual({ allowed: true, status: "allowed" });
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
