export type McpClientCommand = "inspect" | "list-resources" | "read-resource" | "list-tools" | "call-tool";

export interface McpClientOptions {
  command: McpClientCommand | "help";
  url: string;
  json: boolean;
  protocolVersion: string;
  timeoutMs: number;
  uri?: string;
  name?: string;
  args: Record<string, unknown>;
}

export class McpClientCliError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1
  ) {
    super(message);
    this.name = "McpClientCliError";
  }
}

const COMMANDS = new Set<McpClientCommand>(["inspect", "list-resources", "read-resource", "list-tools", "call-tool"]);
export const DEFAULT_MCP_URL = "http://127.0.0.1:3000/mcp";
export const DEFAULT_PROTOCOL_VERSION = "2025-11-25";
export const DEFAULT_TIMEOUT_MS = 10_000;

export function parseMcpClientArgs(argv: string[]): McpClientOptions {
  if (argv.length === 0 || argv.includes("--help") || argv.includes("-h")) {
    return defaultOptions("help");
  }

  const globals = parseGlobalOptions(argv);
  const command = globals.command;
  if (!command) {
    throw new McpClientCliError(`Missing command.\n\n${mcpClientUsage()}`);
  }

  const options: McpClientOptions = {
    command,
    url: globals.url ?? DEFAULT_MCP_URL,
    json: globals.json,
    protocolVersion: globals.protocolVersion ?? DEFAULT_PROTOCOL_VERSION,
    timeoutMs: globals.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    args: {}
  };
  validateUrl(options.url);
  validateTimeoutMs(options.timeoutMs);

  const commandOptions = parseCommandOptions(command, globals.rest);
  if (command === "read-resource") {
    const uri = singleOption(commandOptions, "uri");
    if (!uri) {
      throw new McpClientCliError(`Missing --uri for read-resource.\n\n${mcpClientUsage()}`);
    }
    options.uri = uri;
  } else if (command === "call-tool") {
    const name = singleOption(commandOptions, "name");
    if (!name) {
      throw new McpClientCliError(`Missing --name for call-tool.\n\n${mcpClientUsage()}`);
    }
    options.name = name;
    options.args = parseJsonObject(singleOption(commandOptions, "args") ?? "{}");
  } else {
    ensureNoOptions(commandOptions);
  }

  return options;
}

export function mcpClientUsage(): string {
  return [
    "Usage:",
    "  pnpm mcp:client [--url <mcp-url>] [--json] [--protocol-version <version>] [--timeout-ms <milliseconds>] <command> [options]",
    "",
    "Commands:",
    "  inspect                         Initialize, list resources/tools, and read mcphub://status.",
    "  list-resources                  List MCP resources.",
    "  read-resource --uri <uri>       Read an MCP resource.",
    "  list-tools                      List MCP tools.",
    "  call-tool --name <tool> [--args <json-object>]",
    "",
    "Global options:",
    `  --url <mcp-url>                Defaults to ${DEFAULT_MCP_URL}.`,
    "  --json                         Print normalized JSON output.",
    `  --protocol-version <version>   Defaults to ${DEFAULT_PROTOCOL_VERSION}.`,
    `  --timeout-ms <milliseconds>     Defaults to ${DEFAULT_TIMEOUT_MS}.`,
    "",
    "Examples:",
    "  pnpm mcp:client inspect",
    "  pnpm mcp:client --url http://127.0.0.1:3000/mcp list-tools",
    "  pnpm mcp:client read-resource --uri mcphub://status",
    "  pnpm mcp:client call-tool --name source.search --args '{}'"
  ].join("\n");
}

function defaultOptions(command: McpClientOptions["command"]): McpClientOptions {
  return {
    command,
    url: DEFAULT_MCP_URL,
    json: false,
    protocolVersion: DEFAULT_PROTOCOL_VERSION,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    args: {}
  };
}

function parseGlobalOptions(argv: string[]): {
  command?: McpClientCommand;
  url?: string;
  json: boolean;
  protocolVersion?: string;
  timeoutMs?: number;
  rest: string[];
} {
  let url: string | undefined;
  let json = false;
  let protocolVersion: string | undefined;
  let timeoutMs: number | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (COMMANDS.has(arg as McpClientCommand)) {
      return { command: arg as McpClientCommand, url, json, protocolVersion, timeoutMs, rest: argv.slice(index + 1) };
    }
    switch (arg) {
      case "--url":
        url = requireValue(argv, index, "--url");
        index += 1;
        break;
      case "--json":
        json = true;
        break;
      case "--protocol-version":
        protocolVersion = requireValue(argv, index, "--protocol-version");
        index += 1;
        break;
      case "--timeout-ms":
        timeoutMs = parseTimeoutMs(requireValue(argv, index, "--timeout-ms"));
        index += 1;
        break;
      default:
        if (arg.startsWith("--")) {
          throw new McpClientCliError(`Unknown option ${arg}.\n\n${mcpClientUsage()}`);
        }
        throw new McpClientCliError(`Unknown command ${arg}.\n\n${mcpClientUsage()}`);
    }
  }
  return { url, json, protocolVersion, timeoutMs, rest: [] };
}

function parseCommandOptions(command: McpClientCommand, args: string[]): Record<string, string[]> {
  const allowed = command === "read-resource" ? new Set(["uri"]) : command === "call-tool" ? new Set(["name", "args"]) : new Set<string>();
  const parsed: Record<string, string[]> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new McpClientCliError(`Unexpected argument ${arg}.\n\n${mcpClientUsage()}`);
    }
    const name = arg.slice(2);
    if (!allowed.has(name)) {
      throw new McpClientCliError(`Unknown option --${name} for ${command}.\n\n${mcpClientUsage()}`);
    }
    const value = requireValue(args, index, `--${name}`);
    parsed[name] = [...(parsed[name] ?? []), value];
    index += 1;
  }
  return parsed;
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new McpClientCliError(`Missing value for ${option}.`);
  }
  return value;
}

function validateUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new McpClientCliError("Invalid --url. Use an absolute http or https MCP endpoint URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new McpClientCliError("Invalid --url. Use an absolute http or https MCP endpoint URL.");
  }
}

function parseTimeoutMs(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new McpClientCliError("Invalid --timeout-ms. Use a positive integer number of milliseconds.");
  }
  return parsed;
}

function validateTimeoutMs(value: number): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new McpClientCliError("Invalid --timeout-ms. Use a positive integer number of milliseconds.");
  }
}

function parseJsonObject(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new McpClientCliError("Invalid --args JSON. Use a JSON object string, such as '{}'.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new McpClientCliError("Invalid --args JSON. Use a JSON object string, such as '{}'.");
  }
  return parsed as Record<string, unknown>;
}

function singleOption(options: Record<string, string[]>, name: string): string | undefined {
  const values = options[name];
  if (!values) {
    return undefined;
  }
  if (values.length > 1) {
    throw new McpClientCliError(`Option --${name} can only be provided once.`);
  }
  return values[0];
}

function ensureNoOptions(options: Record<string, string[]>): void {
  const names = Object.keys(options);
  if (names.length > 0) {
    throw new McpClientCliError(`Unexpected option --${names[0]}.`);
  }
}
