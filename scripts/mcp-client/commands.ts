import { McpClientCliError, mcpClientUsage, parseMcpClientArgs, type McpClientOptions } from "./common.js";
import { McpHttpClient } from "./client.js";

interface CommandResult {
  command: string;
  endpoint: string;
  initialize?: unknown;
  result?: unknown;
  resources?: unknown[];
  tools?: unknown[];
  status?: unknown;
  summary?: Record<string, unknown>;
}

export async function runMcpClientCli(argv: string[], io = defaultIo): Promise<void> {
  try {
    const options = parseMcpClientArgs(argv);
    if (options.command === "help") {
      io.stdout(mcpClientUsage());
      return;
    }
    const result = await runMcpClientCommand(options);
    io.stdout(options.json ? `${JSON.stringify(result, null, 2)}\n` : formatHumanOutput(result));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    io.stderr(`${message}\n`);
    process.exitCode = error instanceof McpClientCliError ? error.exitCode : 1;
  }
}

export async function runMcpClientCommand(options: McpClientOptions): Promise<CommandResult> {
  const client = new McpHttpClient({ endpoint: options.url, protocolVersion: options.protocolVersion, timeoutMs: options.timeoutMs });
  const initialize = await client.initialize();
  await client.notifyInitialized();

  switch (options.command) {
    case "inspect":
      return inspect(options, client, initialize);
    case "list-resources":
      return {
        command: options.command,
        endpoint: options.url,
        initialize,
        result: await client.request("resources/list", {})
      };
    case "read-resource":
      return {
        command: options.command,
        endpoint: options.url,
        initialize,
        result: await client.request("resources/read", { uri: options.uri })
      };
    case "list-tools":
      return {
        command: options.command,
        endpoint: options.url,
        initialize,
        result: await client.request("tools/list", {})
      };
    case "call-tool":
      return {
        command: options.command,
        endpoint: options.url,
        initialize,
        result: await client.request("tools/call", { name: options.name, arguments: options.args })
      };
    default:
      throw new McpClientCliError(`Unsupported command ${options.command}.`);
  }
}

async function inspect(options: McpClientOptions, client: McpHttpClient, initialize: unknown): Promise<CommandResult> {
  const resourcesResult = await client.request("resources/list", {});
  const toolsResult = await client.request("tools/list", {});
  const statusResult = await client.request("resources/read", { uri: "mcphub://status" });
  const resources = extractArray(resourcesResult, "resources");
  const tools = extractArray(toolsResult, "tools");
  const statusText = extractMcpText(statusResult);
  const statusJson = parseEmbeddedJson(statusText);
  const pluginTools = tools.filter((tool) => isPluginTool(tool));
  return {
    command: options.command,
    endpoint: options.url,
    initialize,
    resources,
    tools,
    status: statusJson ?? statusText,
    summary: {
      initialize: "ok",
      resourceCount: resources.length,
      toolCount: tools.length,
      statusResource: statusText ? "ok" : "missing",
      platformStatus: statusJson && typeof statusJson.status === "string" ? statusJson.status : "unknown",
      repository: statusJson && isRecord(statusJson.repository) ? statusJson.repository.mode : "unknown",
      pluginsLoaded: statusJson && isRecord(statusJson.plugins) ? statusJson.plugins.loaded : 0,
      pluginToolCount: pluginTools.length,
      pluginTools: pluginTools.slice(0, 5).map((tool) => (isRecord(tool) ? String(tool.name ?? "") : "")).filter(Boolean)
    }
  };
}

export function formatHumanOutput(result: CommandResult): string {
  if (result.command === "inspect") {
    const summary = result.summary ?? {};
    const lines = [
      "MCPHub generic client inspect",
      `Endpoint: ${result.endpoint}`,
      `Initialize: ${String(summary.initialize ?? "unknown")}`,
      `Resources: ${String(summary.resourceCount ?? 0)}`,
      `Tools: ${String(summary.toolCount ?? 0)}`,
      `Status resource: ${String(summary.statusResource ?? "unknown")}`,
      `Platform status: ${String(summary.platformStatus ?? "unknown")}`,
      `Repository: ${String(summary.repository ?? "unknown")}`,
      `Plugins loaded: ${String(summary.pluginsLoaded ?? 0)}`
    ];
    if (Number(summary.pluginToolCount ?? 0) > 0) {
      lines.push(`Plugin tools: ${String(summary.pluginToolCount)} (${(summary.pluginTools as string[]).join(", ")})`);
    }
    return `${lines.join("\n")}\n`;
  }
  return `${JSON.stringify(result.result, null, 2)}\n`;
}

function extractArray(value: unknown, key: string): unknown[] {
  if (!isRecord(value)) {
    return [];
  }
  const entry = value[key];
  return Array.isArray(entry) ? entry : [];
}

function extractMcpText(value: unknown): string {
  if (!isRecord(value)) {
    return typeof value === "string" ? value : "";
  }
  const content = Array.isArray(value.content) ? value.content : Array.isArray(value.contents) ? value.contents : [];
  return content
    .map((entry) => (isRecord(entry) && typeof entry.text === "string" ? entry.text : ""))
    .filter(Boolean)
    .join("\n");
}

function parseEmbeddedJson(value: string): any {
  if (!value) {
    return undefined;
  }
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isPluginTool(tool: unknown): boolean {
  if (!isRecord(tool) || typeof tool.name !== "string") {
    return false;
  }
  return !["source.search", "source.refresh", "extract.preview", "debug.explain"].includes(tool.name);
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const defaultIo = {
  stdout: (message: string) => process.stdout.write(message),
  stderr: (message: string) => process.stderr.write(message)
};
