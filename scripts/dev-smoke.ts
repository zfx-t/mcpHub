import { runRunningInstanceSmoke } from "./smoke-helpers.js";

const baseUrl = process.env.MCPHUB_BASE_URL ?? "http://127.0.0.1:3000";

await runRunningInstanceSmoke({
  baseUrl,
  expectPlugins: process.env.MCPHUB_SMOKE_EXPECT_PLUGINS === "true",
  expectedPluginTool: process.env.MCPHUB_SMOKE_PLUGIN_TOOL
});

console.log(`Dev smoke passed for ${baseUrl}`);
