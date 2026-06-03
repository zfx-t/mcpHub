import {
  pluginManifestSchema,
  pluginToolDefinitionSchema,
  type HttpPluginToolOperation,
  type ModulePluginToolExecutor,
  type PluginType,
  type ToolEffect
} from "@mcphub/core";

export type PluginToolDefinition = ReturnType<typeof pluginToolDefinitionSchema.parse>;

export interface ApiToolDefinition extends PluginToolDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  operation: HttpPluginToolOperation;
}

export interface ExecutorToolDefinition extends PluginToolDefinition {
  executor: ModulePluginToolExecutor;
}

export interface PluginExecutorContext {
  pluginId: string;
  toolName: string;
  requestId: string;
  config: Record<string, unknown>;
  credentials: {
    resolve(requirementId: string): Promise<unknown>;
  };
  http: {
    get(path: string, options?: Record<string, unknown>): Promise<unknown>;
    post(path: string, body?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    put(path: string, body?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    patch(path: string, body?: unknown, options?: Record<string, unknown>): Promise<unknown>;
    delete(path: string, options?: Record<string, unknown>): Promise<unknown>;
    uploadFileParts(target: string, filePath: string, options?: Record<string, unknown>): Promise<unknown>;
  };
  checkpoint(step: string, summary?: Record<string, unknown>): Promise<void>;
  logger: {
    info(message: string, metadata?: Record<string, unknown>): void;
    warn(message: string, metadata?: Record<string, unknown>): void;
    error(message: string, metadata?: Record<string, unknown>): void;
  };
}

export type PluginHandler = (input: unknown, context: PluginExecutorContext) => Promise<unknown> | unknown;
export type PluginHandlers = Record<string, PluginHandler>;
export type PluginManifest = ReturnType<typeof pluginManifestSchema.parse> & {
  handlers?: PluginHandlers;
};

export function definePlugin(input: unknown): PluginManifest {
  const manifest = pluginManifestSchema.parse(input);
  const handlers = readHandlers(input);
  return handlers ? { ...manifest, handlers } : manifest;
}

export function defineTool(input: unknown): PluginToolDefinition {
  return pluginToolDefinitionSchema.parse(input);
}

export function defineApiTool(input: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  effect: ToolEffect;
  method: ApiToolDefinition["method"];
  path: string;
  requiresConfirmation?: boolean;
  credentialRefs?: string[];
}): ApiToolDefinition {
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(input.method)) {
    throw new Error(`Unsupported HTTP method ${input.method}`);
  }
  if (!input.path.startsWith("/")) {
    throw new Error("API tool paths must start with /.");
  }
  const operation: HttpPluginToolOperation = {
    type: "http",
    method: input.method,
    path: input.path
  };
  const tool = defineTool({
    name: input.name,
    description: input.description,
    inputSchema: input.inputSchema,
    effect: input.effect,
    requiresConfirmation: input.requiresConfirmation,
    credentialRefs: input.credentialRefs,
    operation
  });
  return {
    ...tool,
    method: input.method,
    path: input.path,
    operation
  };
}

export function defineExecutorTool(input: {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  effect: ToolEffect;
  handler: string;
  requiresConfirmation?: boolean;
  credentialRefs?: string[];
}): ExecutorToolDefinition {
  const tool = defineTool({
    name: input.name,
    description: input.description,
    inputSchema: input.inputSchema,
    effect: input.effect,
    requiresConfirmation: input.requiresConfirmation,
    credentialRefs: input.credentialRefs,
    executor: {
      type: "module",
      handler: input.handler
    }
  });
  return {
    ...tool,
    executor: {
      type: "module",
      handler: input.handler
    }
  };
}

export function pluginIdForType(type: PluginType, id: string): string {
  return `${type}.${id}`;
}

function readHandlers(input: unknown): PluginHandlers | undefined {
  if (!input || typeof input !== "object" || !("handlers" in input)) {
    return undefined;
  }
  const handlers = (input as { handlers?: unknown }).handlers;
  if (!handlers || typeof handlers !== "object" || Array.isArray(handlers)) {
    return undefined;
  }
  return handlers as PluginHandlers;
}
