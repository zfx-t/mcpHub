import { runRunningInstanceSmoke } from "./smoke-helpers.js";

const baseUrl = process.env.MCPHUB_BASE_URL ?? "http://127.0.0.1:3000";

await runRunningInstanceSmoke({
  baseUrl,
  expectPostgres: true,
  expectPlugins: true,
  expectedPluginTool: process.env.MCPHUB_SMOKE_PLUGIN_TOOL ?? "admin.users.disable",
  auditToolCall: {
    name: process.env.MCPHUB_SMOKE_AUDIT_TOOL ?? "admin.users.disable",
    arguments: { id: "user-1" },
    expectText: "CONFIRMATION_REQUIRED"
  }
});

console.log(`Docker smoke passed for ${baseUrl}`);
