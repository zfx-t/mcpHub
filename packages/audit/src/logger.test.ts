import { describe, expect, it } from "vitest";
import type { Plugin, PluginTool } from "@mcphub/core";
import { MemoryRepository } from "@mcphub/db";
import { AuditLogger, toolAuditInput } from "./logger.js";

const plugin: Plugin = {
  id: "admin",
  name: "Admin",
  version: "0.1.0",
  type: "api",
  description: "Admin API",
  enabled: true,
  config: {}
};

const tool: PluginTool = {
  id: "admin.admin.users.disable",
  pluginId: "admin",
  name: "admin.users.disable",
  description: "Disable users",
  inputSchema: {},
  effect: "dangerous",
  requiresConfirmation: true,
  credentialRefs: [],
  operation: { type: "http", method: "POST", path: "/users/{id}/disable" },
  enabled: true
};

describe("AuditLogger", () => {
  it("records redacted successful and failed tool calls", async () => {
    const repository = new MemoryRepository({ plugins: [plugin], pluginTools: [tool] });
    const logger = new AuditLogger({
      repository,
      now: () => new Date("2026-06-02T00:00:00.000Z"),
      idFactory: () => "audit-1"
    });

    await logger.recordToolCall(
      toolAuditInput("request-1", tool, "succeeded", {
        target: "https://admin.local/users?token=secret",
        inputSummary: { id: "user-1", password: "secret" },
        statusCode: 200,
        durationMs: 12
      })
    );

    const records = await repository.listAuditRecords();
    expect(records).toEqual([
      expect.objectContaining({
        id: "audit-1",
        requestId: "request-1",
        status: "succeeded",
        target: "https://admin.local/users?token=[REDACTED]",
        inputSummary: { id: "user-1", password: "[REDACTED]" }
      })
    ]);
  });

  it("returns recent records newest first", async () => {
    const repository = new MemoryRepository({ plugins: [plugin], pluginTools: [tool] });
    const logger = new AuditLogger({
      repository,
      now: () => new Date("2026-06-02T00:00:00.000Z"),
      idFactory: () => "audit-1"
    });
    await logger.recordToolCall(toolAuditInput("request-1", tool, "blocked", { errorCode: "CONFIRMATION_REQUIRED" }));

    const recent = await logger.recent();

    expect(recent).toHaveLength(1);
    expect(recent[0]?.status).toBe("blocked");
  });
});
