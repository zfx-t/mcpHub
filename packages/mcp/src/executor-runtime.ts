import { ApiConnector } from "@mcphub/api-connector";
import type { ApiHttpMethod, ApiRequest } from "@mcphub/api-connector";
import type { AuditLogger } from "@mcphub/audit";
import { CredentialResolutionError, EnvironmentCredentialStore } from "@mcphub/credentials";
import type { CredentialStore, ResolvedCredential } from "@mcphub/credentials";
import type { PlatformErrorCode, Plugin, PluginTool } from "@mcphub/core";
import type { McpHubRepository } from "@mcphub/db";
import type { PluginExecutorContext, PluginHandler, PluginHandlers } from "@mcphub/plugins";

export interface PluginExecutorRuntimeOptions {
  repository: McpHubRepository;
  handlers?: Record<string, PluginHandlers>;
  apiConnector?: ApiConnector;
  credentialStore?: CredentialStore;
  auditLogger?: AuditLogger;
  logger?: PluginExecutorContext["logger"];
}

export interface ExecutePluginHandlerInput {
  requestId: string;
  plugin: Plugin;
  tool: PluginTool;
  input: unknown;
}

export class PluginExecutorRuntime {
  private readonly apiConnector: ApiConnector;
  private readonly credentialStore: CredentialStore;
  private readonly logger: PluginExecutorContext["logger"];

  constructor(private readonly options: PluginExecutorRuntimeOptions) {
    this.apiConnector = options.apiConnector ?? new ApiConnector();
    this.credentialStore = options.credentialStore ?? new EnvironmentCredentialStore();
    this.logger =
      options.logger ??
      {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined
      };
  }

  async execute(input: ExecutePluginHandlerInput): Promise<unknown> {
    const handler = this.handlerForTool(input.tool);
    const context = this.contextFor(input);
    try {
      return await handler(input.input, context);
    } catch (error) {
      if (error instanceof PluginExecutorRuntimeError) {
        throw error;
      }
      throw normalizeExecutorError(error);
    }
  }

  private handlerForTool(tool: PluginTool): PluginHandler {
    if (!tool.executor || tool.executor.type !== "module") {
      throw new PluginExecutorRuntimeError("PLUGIN_EXECUTION_ERROR", `Tool ${tool.name} does not define a module executor.`);
    }
    const handler = this.options.handlers?.[tool.pluginId]?.[tool.executor.handler];
    if (!handler) {
      throw new PluginExecutorRuntimeError(
        "PLUGIN_EXECUTION_ERROR",
        `Executor handler ${tool.executor.handler} for tool ${tool.name} is not loaded.`
      );
    }
    if (typeof handler !== "function") {
      throw new PluginExecutorRuntimeError(
        "PLUGIN_EXECUTION_ERROR",
        `Executor handler ${tool.executor.handler} for tool ${tool.name} is not a function.`
      );
    }
    return handler;
  }

  private contextFor(input: ExecutePluginHandlerInput): PluginExecutorContext {
    return {
      pluginId: input.plugin.id,
      toolName: input.tool.name,
      requestId: input.requestId,
      config: input.plugin.config,
      credentials: {
        resolve: async (requirementId) => this.resolveCredential(input.plugin, requirementId)
      },
      http: {
        get: (path, options) => this.httpRequest(input.plugin, input.tool, "GET", path, undefined, options),
        post: (path, body, options) => this.httpRequest(input.plugin, input.tool, "POST", path, body, options),
        put: (path, body, options) => this.httpRequest(input.plugin, input.tool, "PUT", path, body, options),
        patch: (path, body, options) => this.httpRequest(input.plugin, input.tool, "PATCH", path, body, options),
        delete: (path, options) => this.httpRequest(input.plugin, input.tool, "DELETE", path, undefined, options),
        uploadFileParts: async () => {
          throw new PluginExecutorRuntimeError("PLUGIN_EXECUTION_ERROR", "context.http.uploadFileParts is not implemented in this runtime version.");
        }
      },
      checkpoint: async (step, summary = {}) => this.checkpoint(input.requestId, input.tool, step, summary),
      logger: this.logger
    };
  }

  private async resolveCredential(plugin: Plugin, requirementId: string): Promise<ResolvedCredential> {
    const credential = await this.options.repository.getCredentialForRequirement(plugin.id, requirementId);
    if (!credential) {
      throw new PluginExecutorRuntimeError("CREDENTIAL_MISSING", `Missing credential binding ${requirementId} for plugin ${plugin.id}.`);
    }
    try {
      return await this.credentialStore.resolve(credential);
    } catch (error) {
      throw normalizeExecutorError(error);
    }
  }

  private async httpRequest(
    plugin: Plugin,
    tool: PluginTool,
    method: ApiHttpMethod,
    path: string,
    body?: unknown,
    options?: Record<string, unknown>
  ): Promise<unknown> {
    const baseUrl = typeof plugin.config.baseUrl === "string" ? plugin.config.baseUrl : undefined;
    if (!baseUrl) {
      throw new PluginExecutorRuntimeError("PLUGIN_EXECUTION_ERROR", `Plugin ${plugin.id} is missing config.baseUrl.`);
    }
    const request: ApiRequest = {
      baseUrl,
      method,
      path,
      query: method === "GET" || method === "DELETE" ? readRecordOption(options, "query") : undefined,
      headers: readStringRecordOption(options, "headers"),
      body,
      credentials: await this.resolveToolCredentials(plugin, tool),
      timeoutMs: readNumberOption(options, "timeoutMs")
    };
    const result = await this.apiConnector.executeJson(request);
    if (result.ok) {
      return result.data;
    }
    throw new PluginExecutorRuntimeError(result.error.code, result.error.message);
  }

  private async resolveToolCredentials(plugin: Plugin, tool: PluginTool): Promise<ResolvedCredential[]> {
    const credentials = [];
    for (const requirementId of tool.credentialRefs) {
      credentials.push(await this.resolveCredential(plugin, requirementId));
    }
    return credentials;
  }

  private async checkpoint(requestId: string, tool: PluginTool, step: string, summary: Record<string, unknown>): Promise<void> {
    if (!this.options.auditLogger) {
      return;
    }
    await this.options.auditLogger.recordToolCall({
      requestId,
      pluginId: tool.pluginId,
      toolName: tool.name,
      effect: tool.effect,
      status: "succeeded",
      inputSummary: {
        _checkpointStep: step,
        ...summary
      }
    });
  }
}

export class PluginExecutorRuntimeError extends Error {
  constructor(
    readonly code: Extract<
      PlatformErrorCode,
      "CREDENTIAL_MISSING" | "CREDENTIAL_INVALID" | "REMOTE_HTTP_ERROR" | "REMOTE_TIMEOUT" | "PLUGIN_EXECUTION_ERROR"
    >,
    message: string
  ) {
    super(message);
    this.name = "PluginExecutorRuntimeError";
  }
}

function normalizeExecutorError(error: unknown): PluginExecutorRuntimeError {
  if (error instanceof PluginExecutorRuntimeError) {
    return error;
  }
  if (error instanceof CredentialResolutionError) {
    return new PluginExecutorRuntimeError(error.code, error.message);
  }
  return new PluginExecutorRuntimeError("PLUGIN_EXECUTION_ERROR", error instanceof Error ? error.message : "Unknown plugin execution error.");
}

function readRecordOption(options: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = options?.[key];
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function readStringRecordOption(options: Record<string, unknown> | undefined, key: string): Record<string, string> | undefined {
  const value = readRecordOption(options, key);
  if (!value) {
    return undefined;
  }
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function readNumberOption(options: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = options?.[key];
  return typeof value === "number" ? value : undefined;
}
