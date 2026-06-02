import { describe, expect, it } from "vitest";
import { createSeedRepository } from "./index.js";

describe("MemoryRepository", () => {
  it("loads seed sources and matches by URL", async () => {
    const repo = createSeedRepository();
    await expect(repo.listSources()).resolves.toHaveLength(4);
    await expect(repo.findSourceByUrl("https://example.com/articles/hello")).resolves.toMatchObject({
      id: "src_example_articles"
    });
  });

  it("filters sources by hostname", async () => {
    const repo = createSeedRepository();
    await expect(repo.listSources({ hostname: "news.example.net" })).resolves.toHaveLength(1);
  });

  it("stores platform plugins, tools, credentials, and audit records", async () => {
    const repo = createSeedRepository();
    await repo.upsertPlugin({
      id: "admin-users",
      name: "Admin Users",
      version: "0.1.0",
      type: "api",
      description: "Expose admin user APIs.",
      enabled: true,
      config: { baseUrl: "https://admin.example.com" }
    });
    await repo.upsertPluginTool({
      id: "tool_admin_users_list",
      pluginId: "admin-users",
      name: "admin.users.list",
      description: "List users.",
      inputSchema: { type: "object" },
      effect: "read",
      requiresConfirmation: false,
      credentialRefs: ["admin-token"],
      operation: { type: "http", method: "GET", path: "/api/users" },
      enabled: true
    });
    await repo.upsertCredential({
      id: "cred_admin_token",
      pluginId: "admin-users",
      requirementId: "admin-token",
      name: "Admin token",
      type: "bearer",
      secretRef: "env:ADMIN_TOKEN",
      scope: "admin-users"
    });
    await repo.addAuditRecord({
      id: "audit_1",
      requestId: "req_1",
      pluginId: "admin-users",
      toolName: "admin.users.list",
      effect: "read",
      status: "succeeded",
      target: "GET /api/users?token=raw-secret",
      inputSummary: {
        page: 1,
        token: "raw-secret",
        nested: { password: "pw", note: "safe" },
        headers: [{ authorization: "Bearer abc123" }]
      },
      statusCode: 200,
      durationMs: 42,
      errorMessage: "authorization=raw-secret",
      timestamp: "2026-06-02T00:00:00.000Z"
    });

    await expect(repo.getPlugin("admin-users")).resolves.toMatchObject({ type: "api", enabled: true });
    await expect(repo.listPluginTools("admin-users")).resolves.toHaveLength(1);
    await expect(repo.getPluginToolByName("admin.users.list")).resolves.toMatchObject({ id: "tool_admin_users_list" });
    await expect(repo.getCredentialForRequirement("admin-users", "admin-token")).resolves.toMatchObject({ id: "cred_admin_token" });
    await expect(repo.listCredentials("admin-users")).resolves.toEqual([
      expect.objectContaining({ secretRef: "env:ADMIN_TOKEN" })
    ]);
    const auditRecords = await repo.listAuditRecords({ pluginId: "admin-users", status: "succeeded" });
    expect(auditRecords).toEqual([expect.objectContaining({ toolName: "admin.users.list" })]);
    expect(auditRecords[0]).toMatchObject({
      target: "GET /api/users?token=[REDACTED]",
      inputSummary: {
        page: 1,
        token: "[REDACTED]",
        nested: { password: "[REDACTED]", note: "safe" },
        headers: [{ authorization: "[REDACTED]" }]
      },
      errorMessage: "authorization=[REDACTED]"
    });
  });

  it("mirrors platform storage constraints for plugins", async () => {
    const repo = createSeedRepository();
    await expect(
      repo.upsertPluginTool({
        id: "orphan_tool",
        pluginId: "missing-plugin",
        name: "admin.users.list",
        description: "List users.",
        inputSchema: {},
        effect: "read",
        requiresConfirmation: false,
        credentialRefs: [],
        enabled: true
      })
    ).rejects.toThrow(/Unknown plugin/);

    await repo.upsertPlugin({
      id: "admin-users",
      name: "Admin Users",
      version: "0.1.0",
      type: "api",
      description: "Expose admin user APIs.",
      enabled: true,
      config: {}
    });
    await repo.upsertPluginTool({
      id: "tool_1",
      pluginId: "admin-users",
      name: "admin.users.list",
      description: "List users.",
      inputSchema: {},
      effect: "read",
      requiresConfirmation: false,
      credentialRefs: [],
      enabled: true
    });
    await expect(
      repo.upsertPluginTool({
        id: "tool_2",
        pluginId: "admin-users",
        name: "admin.users.list",
        description: "Duplicate list users.",
        inputSchema: {},
        effect: "read",
        requiresConfirmation: false,
        credentialRefs: [],
        enabled: true
      })
    ).rejects.toThrow(/Duplicate plugin tool name/);
    await expect(
      repo.upsertCredential({
        id: "orphan_credential",
        pluginId: "missing-plugin",
        name: "Missing credential",
        type: "bearer",
        secretRef: "env:MISSING"
      })
    ).rejects.toThrow(/Unknown plugin/);
  });
});
