import { z } from "zod";
import { ApiConnector, summarizeRequest } from "@mcphub/api-connector";
import type { ApiConnectorResult, ApiHttpMethod, ApiRequest } from "@mcphub/api-connector";
import type { AuditLogger } from "@mcphub/audit";
import { CredentialResolutionError, EnvironmentCredentialStore } from "@mcphub/credentials";
import type { CredentialStore } from "@mcphub/credentials";
import { sourceSearchFiltersSchema, toResourceUri } from "@mcphub/core";
import type { CredentialType, FeedItem, PlatformErrorCode, Plugin, PluginTool } from "@mcphub/core";
import type { McpHubRepository } from "@mcphub/db";
import type { ExtractionService } from "@mcphub/extractors";
import type { PluginRegistry } from "@mcphub/plugins";
import { evaluateToolPolicy } from "@mcphub/policy";
import type { PolicyConfig } from "@mcphub/policy";

export interface McpContent {
  uri: string;
  mimeType?: string;
  text: string;
}

export interface McpResourceDescriptor {
  uri: string;
  name: string;
  title: string;
  description: string;
  mimeType: string;
}

export interface PlatformPluginMetadata {
  source: "built_in" | "local";
  credentials: Array<{ id: string; type: CredentialType; configured: boolean }>;
}

export interface PlatformGatewayOptions {
  registry?: PluginRegistry;
  apiConnector?: ApiConnector;
  credentialStore?: CredentialStore;
  auditLogger?: AuditLogger;
  policy?: PolicyConfig;
  pluginPolicies?: Record<string, PolicyConfig>;
  pluginMetadata?: Record<string, PlatformPluginMetadata>;
}

type DecoratedPlugin = Plugin & Partial<PlatformPluginMetadata>;

export class WebMcpGateway {
  private readonly apiConnector: ApiConnector;
  private readonly credentialStore: CredentialStore;

  constructor(
    private readonly repository: McpHubRepository,
    private readonly extraction: ExtractionService,
    private readonly platform: PlatformGatewayOptions = {}
  ) {
    this.apiConnector = platform.apiConnector ?? new ApiConnector();
    this.credentialStore = platform.credentialStore ?? new EnvironmentCredentialStore();
  }

  listResources(): McpResourceDescriptor[] {
    const resources = [
      {
        uri: "webmcp://sources",
        name: "sources",
        title: "Sources",
        description: "Available Web to MCP sources.",
        mimeType: "application/json"
      }
    ];
    if (this.platform.registry) {
      resources.push(
        {
          uri: "mcphub://plugins",
          name: "plugins",
          title: "Plugins",
          description: "Enabled MCPHub plugins.",
          mimeType: "application/json"
        },
        {
          uri: "mcphub://audit/recent",
          name: "audit-recent",
          title: "Recent Audit Records",
          description: "Recent plugin tool call audit records.",
          mimeType: "application/json"
        }
      );
    }
    return resources;
  }

  async readResource(uri: string): Promise<McpContent[]> {
    if (uri === "mcphub://plugins") {
      return jsonContent(uri, await this.listPlatformPlugins());
    }

    if (uri === "mcphub://audit/recent") {
      return jsonContent(uri, this.platform.auditLogger ? await this.platform.auditLogger.recent() : await this.repository.listAuditRecords());
    }

    const pluginToolsMatch = uri.match(/^mcphub:\/\/plugins\/([^/]+)\/tools$/);
    if (pluginToolsMatch) {
      return jsonContent(uri, await this.listPlatformTools(pluginToolsMatch[1]));
    }

    const pluginMatch = uri.match(/^mcphub:\/\/plugins\/([^/]+)$/);
    if (pluginMatch) {
      const plugin = await this.getPlatformPlugin(pluginMatch[1]);
      if (!plugin) {
        throw new Error(`Unknown plugin ${pluginMatch[1]}`);
      }
      return jsonContent(uri, this.decoratePlugin(plugin));
    }

    if (uri === "webmcp://sources") {
      return jsonContent(uri, await this.repository.listSources());
    }

    const sourceItemsMatch = uri.match(/^webmcp:\/\/sources\/([^/]+)\/items$/);
    if (sourceItemsMatch) {
      return jsonContent(uri, await this.repository.listItems(sourceItemsMatch[1]));
    }

    const sourceMatch = uri.match(/^webmcp:\/\/sources\/([^/]+)$/);
    if (sourceMatch) {
      const source = await this.repository.getSource(sourceMatch[1]);
      if (!source) {
        throw new Error(`Unknown source ${sourceMatch[1]}`);
      }
      const diagnostics = await this.repository.listDiagnostics({ sourceId: source.id });
      return jsonContent(uri, { ...source, diagnostics: diagnostics.slice(-10) });
    }

    const itemMatch = uri.match(/^webmcp:\/\/items\/([^/]+)$/);
    if (itemMatch) {
      const item = await this.repository.getItem(itemMatch[1]);
      if (!item) {
        throw new Error(`Unknown item ${itemMatch[1]}`);
      }
      const document = await this.repository.getDocument(item.documentId);
      return jsonContent(uri, { item, document });
    }

    const ruleDiagnosticsMatch = uri.match(/^webmcp:\/\/rules\/([^/]+)\/diagnostics$/);
    if (ruleDiagnosticsMatch) {
      return jsonContent(uri, await this.repository.listDiagnostics({ ruleId: ruleDiagnosticsMatch[1] }));
    }

    throw new Error(`Unsupported resource URI ${uri}`);
  }

  listTools(): Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> {
    const tools: Array<{ name: string; description: string; inputSchema: Record<string, unknown> }> = [
      {
        name: "source.search",
        description: "Search available Sources.",
        inputSchema: { type: "object", properties: { query: { type: "string" }, filters: { type: "object" } } }
      },
      {
        name: "source.refresh",
        description: "Refresh a Source.",
        inputSchema: { type: "object", required: ["sourceId"], properties: { sourceId: { type: "string" }, mode: { type: "string" } } }
      },
      {
        name: "extract.preview",
        description: "Run preview extraction without writing cached content.",
        inputSchema: { type: "object", required: ["url"], properties: { url: { type: "string" }, sourceId: { type: "string" } } }
      },
      {
        name: "debug.explain",
        description: "Explain extraction path, confidence, warnings, and failures.",
        inputSchema: { type: "object", properties: { sourceId: { type: "string" }, itemId: { type: "string" } } }
      }
    ];
    const existing = new Set(tools.map((tool) => tool.name));
    for (const tool of this.platform.registry?.listPluginTools() ?? []) {
      if (tool.enabled && !existing.has(tool.name)) {
        tools.push({ name: tool.name, description: tool.description, inputSchema: tool.inputSchema });
        existing.add(tool.name);
      }
    }
    return tools;
  }

  async callTool(name: string, input: unknown): Promise<McpContent[]> {
    switch (name) {
      case "source.search":
        return this.sourceSearch(input);
      case "source.refresh":
        return this.sourceRefresh(input);
      case "extract.preview":
        return this.extractPreview(input);
      case "debug.explain":
        return this.debugExplain(input);
      default:
        return this.callPlatformTool(name, input);
    }
  }

  async handleJsonRpc(payload: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      let result: unknown;
      switch (payload.method) {
        case "initialize":
          result = {
            protocolVersion: "2025-11-25",
            serverInfo: { name: "mcphub", version: "0.1.0" },
            capabilities: { resources: {}, tools: {} }
          };
          break;
        case "resources/list":
          result = { resources: this.listResources() };
          break;
        case "resources/read":
          result = { contents: await this.readResource(String(payload.params?.uri)) };
          break;
        case "tools/list":
          result = { tools: this.listTools() };
          break;
        case "tools/call":
          result = { content: await this.callTool(String(payload.params?.name), payload.params?.arguments ?? {}) };
          break;
        default:
          throw new Error(`Unsupported method ${payload.method}`);
      }
      return { jsonrpc: "2.0", id: payload.id, result };
    } catch (error) {
      return {
        jsonrpc: "2.0",
        id: payload.id,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : "Unknown MCP error",
          data: {
            code: "MCP_GATEWAY_ERROR",
            retryable: false
          }
        }
      };
    }
  }

  private async sourceSearch(input: unknown): Promise<McpContent[]> {
    const parsed = z
      .object({
        query: z.string().optional(),
        filters: sourceSearchFiltersSchema.optional()
      })
      .parse(input);
    const query = parsed.query?.toLowerCase();
    const sources = await this.repository.listSources(parsed.filters);
    const filtered = query
      ? sources.filter((source) => `${source.name} ${source.description} ${source.urlPattern}`.toLowerCase().includes(query))
      : sources;
    return jsonContent("tool://source.search", filtered);
  }

  private async sourceRefresh(input: unknown): Promise<McpContent[]> {
    const parsed = z
      .object({
        sourceId: z.string(),
        mode: z.enum(["cached", "force", "validate_only"]).optional()
      })
      .parse(input);
    return jsonContent("tool://source.refresh", await this.extraction.refreshSource(parsed.sourceId, { mode: parsed.mode }));
  }

  private async extractPreview(input: unknown): Promise<McpContent[]> {
    const parsed = z.object({ url: z.string().url(), sourceId: z.string().optional() }).parse(input);
    return jsonContent("tool://extract.preview", await this.extraction.preview(parsed.url, parsed.sourceId));
  }

  private async debugExplain(input: unknown): Promise<McpContent[]> {
    const parsed = z.object({ sourceId: z.string().optional(), itemId: z.string().optional() }).parse(input);
    const item = parsed.itemId ? await this.repository.getItem(parsed.itemId) : undefined;
    const diagnostics = await this.repository.listDiagnostics({ sourceId: parsed.sourceId, itemId: parsed.itemId });
    const document = item ? await this.repository.getDocument(item.documentId) : undefined;
    return jsonContent("tool://debug.explain", {
      item,
      document,
      diagnostics,
      warnings: document?.extractionWarnings ?? []
    });
  }

  private async callPlatformTool(name: string, input: unknown): Promise<McpContent[]> {
    const tool = await this.getPlatformToolByName(name);
    if (!tool) {
      throw new Error(`Unknown tool ${name}`);
    }
    const plugin = await this.getPlatformPlugin(tool.pluginId);
    const target = this.targetForTool(plugin, tool, input);
    const decision = evaluateToolPolicy({
      plugin,
      tool,
      target,
      confirmationToken: confirmationTokenFromInput(input),
      policy: this.policyForPlugin(tool.pluginId)
    });
    if (!decision.allowed) {
      await this.writeToolAudit(tool, decision.status, input, {
        target: target.url,
        policyMode: this.policyForPlugin(tool.pluginId).dangerousMode,
        errorCode: decision.code,
        errorMessage: decision.message
      });
      return jsonContent(`tool://${name}`, platformErrorResult(name, decision.code, decision.message));
    }

    if (!plugin || !tool.operation || tool.operation.type !== "http") {
      const message = `Tool ${name} does not have an executable HTTP operation.`;
      await this.writeToolAudit(tool, "failed", input, {
        target: target.url,
        policyMode: this.policyForPlugin(tool.pluginId).dangerousMode,
        errorCode: "PLUGIN_EXECUTION_ERROR",
        errorMessage: message
      });
      return jsonContent(`tool://${name}`, platformErrorResult(name, "PLUGIN_EXECUTION_ERROR", message));
    }

    let request: ApiRequest;
    try {
      request = await this.requestForTool(plugin, tool, input);
    } catch (error) {
      const executionError = platformExecutionError(error);
      await this.writeToolAudit(tool, "failed", input, {
        target: target.url,
        policyMode: this.policyForPlugin(tool.pluginId).dangerousMode,
        errorCode: executionError.code,
        errorMessage: executionError.message
      });
      return jsonContent(`tool://${name}`, platformErrorResult(name, executionError.code, executionError.message));
    }

    await this.writeToolAudit(tool, "allowed", input, {
      target: target.url,
      policyMode: this.policyForPlugin(tool.pluginId).dangerousMode
    });

    try {
      const result = await this.apiConnector.executeJson(request);
      await this.writeToolAudit(tool, result.ok ? "succeeded" : "failed", input, {
        target: result.metadata.targetUrl,
        policyMode: this.policyForPlugin(tool.pluginId).dangerousMode,
        statusCode: result.metadata.statusCode,
        durationMs: result.metadata.durationMs,
        errorCode: result.ok ? undefined : result.error.code,
        errorMessage: result.ok ? undefined : result.error.message
      });
      return jsonContent(`tool://${name}`, toolResultFromConnector(name, result));
    } catch (error) {
      const executionError = platformExecutionError(error);
      await this.writeToolAudit(tool, "failed", input, {
        target: target.url,
        policyMode: this.policyForPlugin(tool.pluginId).dangerousMode,
        errorCode: executionError.code,
        errorMessage: executionError.message
      });
      return jsonContent(`tool://${name}`, platformErrorResult(name, executionError.code, executionError.message));
    }
  }

  private async requestForTool(plugin: Plugin, tool: PluginTool, input: unknown): Promise<ApiRequest> {
    if (!tool.operation || tool.operation.type !== "http") {
      throw new Error(`Tool ${tool.name} does not define an HTTP operation.`);
    }
    const baseUrl = typeof plugin.config.baseUrl === "string" ? plugin.config.baseUrl : undefined;
    if (!baseUrl) {
      throw new PluginExecutionError("PLUGIN_EXECUTION_ERROR", `Plugin ${plugin.id} is missing config.baseUrl.`);
    }
    const normalizedInput = isRecord(input) ? input : {};
    const pathKeys = pathParameterNames(tool.operation.path);
    const pathParams = Object.fromEntries(pathKeys.map((key) => [key, normalizedInput[key]]).filter(([, value]) => value !== undefined));
    const restInput = Object.fromEntries(Object.entries(normalizedInput).filter(([key]) => !pathKeys.includes(key) && key !== "confirmationToken"));
    const credentials = [];
    for (const requirementId of tool.credentialRefs) {
      const credential = await this.repository.getCredentialForRequirement(plugin.id, requirementId);
      if (!credential) {
        throw new PluginExecutionError("CREDENTIAL_MISSING", `Missing credential binding ${requirementId} for plugin ${plugin.id}.`);
      }
      credentials.push(credential);
    }
    const resolvedCredentials = await this.credentialStore.resolveAll(credentials);
    return {
      baseUrl,
      method: tool.operation.method as ApiHttpMethod,
      path: tool.operation.path,
      pathParams,
      query: isBodyMethod(tool.operation.method) ? undefined : restInput,
      body: isBodyMethod(tool.operation.method) ? restInput : undefined,
      credentials: resolvedCredentials
    };
  }

  private targetForTool(plugin: Plugin | undefined, tool: PluginTool, input: unknown) {
    if (!plugin || !tool.operation || tool.operation.type !== "http") {
      return {};
    }
    const baseUrl = typeof plugin.config.baseUrl === "string" ? plugin.config.baseUrl : "";
    const path = renderPathForTarget(tool.operation.path, isRecord(input) ? input : {});
    return {
      url: baseUrl ? new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString() : undefined,
      method: tool.operation.method,
      path
    };
  }

  private async getPlatformPlugin(pluginId: string): Promise<Plugin | undefined> {
    const registryPlugin = this.platform.registry?.listPlugins().find((plugin) => plugin.id === pluginId);
    if (!registryPlugin) {
      return undefined;
    }
    const storedPlugin = await this.repository.getPlugin(pluginId);
    return {
      ...registryPlugin,
      config: storedPlugin?.config ?? registryPlugin.config,
      createdAt: storedPlugin?.createdAt,
      updatedAt: storedPlugin?.updatedAt
    };
  }

  private async listPlatformPlugins(): Promise<DecoratedPlugin[]> {
    const plugins = await Promise.all((this.platform.registry?.listPlugins() ?? []).map((plugin) => this.getPlatformPlugin(plugin.id)));
    return plugins
      .filter((plugin): plugin is Plugin => Boolean(plugin))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((plugin) => this.decoratePlugin(plugin));
  }

  private async getPlatformToolByName(name: string): Promise<PluginTool | undefined> {
    return this.platform.registry?.getPluginToolByName(name);
  }

  private listPlatformTools(pluginId: string): PluginTool[] {
    return this.platform.registry?.listPluginTools(pluginId) ?? [];
  }

  private async writeToolAudit(
    tool: PluginTool,
    status: "allowed" | "blocked" | "succeeded" | "failed" | "policy_denied",
    input: unknown,
    patch: { target?: string; policyMode?: string; statusCode?: number; durationMs?: number; errorCode?: string; errorMessage?: string }
  ): Promise<void> {
    if (!this.platform.auditLogger) {
      return;
    }
    await this.platform.auditLogger.recordToolCall({
      requestId: crypto.randomUUID(),
      pluginId: tool.pluginId,
      toolName: tool.name,
      effect: tool.effect,
      status,
      target: patch.target,
      inputSummary: summarizeInput(input, patch.policyMode),
      statusCode: patch.statusCode,
      durationMs: patch.durationMs,
      errorCode: patch.errorCode,
      errorMessage: patch.errorMessage
    });
  }

  private policyForPlugin(pluginId: string): PolicyConfig {
    return this.platform.pluginPolicies?.[pluginId] ?? this.platform.policy ?? {};
  }

  private decoratePlugin(plugin: Plugin): DecoratedPlugin {
    const metadata = this.platform.pluginMetadata?.[plugin.id];
    if (!metadata) {
      return plugin;
    }
    return {
      ...plugin,
      ...metadata
    };
  }
}

interface JsonRpcRequest {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method: string;
  params?: Record<string, any>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number | null;
  result?: unknown;
  error?: { code: number; message: string; data?: Record<string, unknown> };
}

function jsonContent(uri: string, value: unknown): McpContent[] {
  return [{ uri, mimeType: "application/json", text: JSON.stringify(value, null, 2) }];
}

export function itemContentUri(item: FeedItem): string {
  return toResourceUri("items", item.id);
}

function pathParameterNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((match) => match[1]);
}

function renderPathForTarget(path: string, input: Record<string, unknown>): string {
  return path.replace(/\{([^}]+)\}/g, (_match, key: string) => encodeURIComponent(String(input[key] ?? `{${key}}`)));
}

function isBodyMethod(method: string): boolean {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(method);
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function confirmationTokenFromInput(input: unknown): string | undefined {
  return isRecord(input) && typeof input.confirmationToken === "string" ? input.confirmationToken : undefined;
}

function summarizeInput(input: unknown, policyMode?: string): Record<string, unknown> {
  const summary = summarizeRequest({
    baseUrl: "tool://local",
    method: "POST",
    path: "/tool",
    body: input
  });
  const base = summary.body && isRecord(summary.body) ? summary.body : { value: summary.body };
  return policyMode ? { ...base, _policyMode: policyMode } : base;
}

function platformErrorResult(operation: string, code: PlatformErrorCode, message: string) {
  return {
    ok: false,
    operation,
    error: {
      code,
      message,
      retryable: false
    }
  };
}

function toolResultFromConnector(operation: string, result: ApiConnectorResult) {
  if (result.ok) {
    return {
      ok: true,
      operation,
      data: result.data,
      metadata: result.metadata
    };
  }
  return {
    ok: false,
    operation,
    error: result.error,
    metadata: result.metadata
  };
}

class PluginExecutionError extends Error {
  constructor(
    readonly code: Extract<PlatformErrorCode, "CREDENTIAL_MISSING" | "CREDENTIAL_INVALID" | "PLUGIN_EXECUTION_ERROR">,
    message: string
  ) {
    super(message);
    this.name = "PluginExecutionError";
  }
}

function platformExecutionError(error: unknown): {
  code: Extract<PlatformErrorCode, "CREDENTIAL_MISSING" | "CREDENTIAL_INVALID" | "PLUGIN_EXECUTION_ERROR">;
  message: string;
} {
  if (error instanceof PluginExecutionError || error instanceof CredentialResolutionError) {
    return {
      code: error.code,
      message: error.message
    };
  }
  return {
    code: "PLUGIN_EXECUTION_ERROR",
    message: error instanceof Error ? error.message : "Unknown plugin execution error."
  };
}
