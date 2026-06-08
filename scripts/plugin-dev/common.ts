import path from "node:path";

export type PluginTemplate = "http-api" | "executor";
export type CredentialType = "bearer" | "api_key_header" | "api_key_query" | "basic" | "cookie" | "env";
export type ToolEffect = "read" | "write" | "dangerous";

export interface CreatePluginOptions {
  pluginName: string;
  template: PluginTemplate;
  outDir: string;
  baseUrl: string;
  toolName: string;
  credentialId: string;
  credentialType: CredentialType;
  secretEnv: string;
  force: boolean;
}

export interface VerifyPluginOptions {
  pluginDir: string;
}

export class PluginCliError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginCliError";
  }
}

export const DEFAULT_OUT_DIR = "examples/plugins";
export const DEFAULT_BASE_URL = "http://127.0.0.1:4001";
export const DEFAULT_CREDENTIAL_ID = "api-token";
export const DEFAULT_CREDENTIAL_TYPE: CredentialType = "bearer";
export const CREDENTIAL_TYPES: readonly CredentialType[] = ["bearer", "api_key_header", "api_key_query", "basic", "cookie", "env"];

export function parseCreateArgs(argv: string[]): CreatePluginOptions {
  const [pluginName, ...rest] = argv;
  if (!pluginName || pluginName.startsWith("--")) {
    throw new PluginCliError(`Missing plugin name.\n\n${createUsage()}`);
  }

  const options = parseFlags(rest);
  const template = requiredTemplate(options);
  ensureNoUnknownValues(
    options.values,
    new Set(["template", "out", "base-url", "tool-name", "credential-id", "credential-type", "secret-env"])
  );
  const outDir = singleOption(options, "out") ?? DEFAULT_OUT_DIR;
  const baseUrl = singleOption(options, "base-url") ?? DEFAULT_BASE_URL;
  const credentialId = singleOption(options, "credential-id") ?? DEFAULT_CREDENTIAL_ID;
  const credentialType = parseCredentialType(singleOption(options, "credential-type") ?? DEFAULT_CREDENTIAL_TYPE);
  const secretEnv = singleOption(options, "secret-env") ?? defaultSecretEnv(pluginName);
  const toolName = singleOption(options, "tool-name") ?? defaultToolName(pluginName);
  const force = options.booleans.has("force");

  ensureNoUnknownBooleans(options.booleans, new Set(["force"]));
  validatePluginSlug(pluginName);
  validateBaseUrl(baseUrl);
  validateToolName(toolName);
  validateCredentialId(credentialId);
  validateSecretEnv(secretEnv);

  return {
    pluginName,
    template,
    outDir,
    baseUrl,
    toolName,
    credentialId,
    credentialType,
    secretEnv,
    force
  };
}

export function parseVerifyArgs(argv: string[]): VerifyPluginOptions {
  const [pluginDir, ...rest] = argv;
  if (!pluginDir || pluginDir.startsWith("--")) {
    throw new PluginCliError(`Missing plugin directory.\n\n${verifyUsage()}`);
  }
  const options = parseFlags(rest);
  ensureNoUnknownBooleans(options.booleans, new Set());
  if (Object.keys(options.values).length > 0) {
    throw new PluginCliError(`Unknown option --${Object.keys(options.values)[0]}.\n\n${verifyUsage()}`);
  }
  return { pluginDir };
}

export function createUsage(): string {
  return [
    "Usage:",
    "  pnpm plugin:create <plugin-name> --template <http-api|executor> [options]",
    "",
    "Options:",
    "  --out <dir>                    Parent output directory. Defaults to examples/plugins.",
    "  --base-url <url>               Plugin config baseUrl. Defaults to http://127.0.0.1:4001.",
    "  --tool-name <name>             MCP tool name, such as admin.users.list.",
    "  --credential-id <id>           Credential requirement id. Defaults to api-token.",
    "  --credential-type <type>       bearer, api_key_header, api_key_query, basic, cookie, or env.",
    "  --secret-env <name>            Environment variable used by secretRef.",
    "  --force                        Overwrite an existing plugin directory."
  ].join("\n");
}

export function verifyUsage(): string {
  return [
    "Usage:",
    "  pnpm plugin:verify <plugin-dir>",
    "",
    "Example:",
    "  pnpm plugin:verify examples/plugins/my-admin"
  ].join("\n");
}

export function defaultToolName(pluginName: string): string {
  return `${pluginName.replace(/[-_]+/g, ".")}.example.read`;
}

export function defaultSecretEnv(pluginName: string): string {
  return `${pluginName.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase()}_TOKEN`;
}

export function pluginDisplayName(pluginName: string): string {
  return pluginName
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

export function relativeFromCwd(targetPath: string): string {
  const relative = path.relative(process.cwd(), targetPath);
  return relative && !relative.startsWith("..") ? relative : targetPath;
}

export function toolMode(tool: { operation?: unknown; executor?: unknown }): "http" | "executor" {
  return tool.executor ? "executor" : "http";
}

export function validatePluginSlug(value: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) {
    throw new PluginCliError("Invalid plugin name. Use a lowercase slug such as my-admin or video_upload.");
  }
}

export function validateBaseUrl(value: string): void {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new PluginCliError("Invalid base URL. Use an absolute http or https URL.");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new PluginCliError("Invalid base URL. Use an absolute http or https URL.");
  }
}

export function validateToolName(value: string): void {
  if (!/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/.test(value)) {
    throw new PluginCliError("Invalid tool name. Use dot-separated lowercase identifiers, such as admin.users.list.");
  }
}

export function validateCredentialId(value: string): void {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(value)) {
    throw new PluginCliError("Invalid credential id. Use a lowercase slug such as api-token.");
  }
}

function ensureNoUnknownValues(actual: Record<string, string[]>, allowed: Set<string>): void {
  for (const name of Object.keys(actual)) {
    if (!allowed.has(name)) {
      throw new PluginCliError(`Unknown option --${name}.`);
    }
  }
}

export function validateSecretEnv(value: string): void {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(value)) {
    throw new PluginCliError("Invalid secret env name. Use uppercase letters, numbers, and underscores.");
  }
}

export function toolEffectForTemplate(template: PluginTemplate): ToolEffect {
  return template === "executor" ? "write" : "read";
}

interface ParsedFlags {
  values: Record<string, string[]>;
  booleans: Set<string>;
}

function parseFlags(args: string[]): ParsedFlags {
  const parsed: ParsedFlags = { values: {}, booleans: new Set() };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith("--")) {
      throw new PluginCliError(`Unexpected argument ${arg}.`);
    }
    const name = arg.slice(2);
    if (!name) {
      throw new PluginCliError("Invalid empty option.");
    }
    if (name === "force") {
      parsed.booleans.add(name);
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
      throw new PluginCliError(`Missing value for --${name}.`);
    }
    parsed.values[name] = [...(parsed.values[name] ?? []), value];
    index += 1;
  }
  return parsed;
}

function requiredTemplate(options: ParsedFlags): PluginTemplate {
  const value = singleOption(options, "template");
  if (!value) {
    throw new PluginCliError(`Missing --template. Use http-api or executor.\n\n${createUsage()}`);
  }
  if (value !== "http-api" && value !== "executor") {
    throw new PluginCliError(`Unknown template "${value}". Use http-api or executor.`);
  }
  return value;
}

function singleOption(options: ParsedFlags, name: string): string | undefined {
  const values = options.values[name];
  if (!values) {
    return undefined;
  }
  if (values.length > 1) {
    throw new PluginCliError(`Option --${name} can only be provided once.`);
  }
  return values[0];
}

function parseCredentialType(value: string): CredentialType {
  if (!CREDENTIAL_TYPES.includes(value as CredentialType)) {
    throw new PluginCliError(`Invalid credential type "${value}". Use bearer, api_key_header, api_key_query, basic, cookie, or env.`);
  }
  return value as CredentialType;
}

function ensureNoUnknownBooleans(actual: Set<string>, allowed: Set<string>): void {
  for (const name of actual) {
    if (!allowed.has(name)) {
      throw new PluginCliError(`Unknown option --${name}.`);
    }
  }
}
