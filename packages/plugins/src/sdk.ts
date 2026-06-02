import {
  pluginManifestSchema,
  pluginToolDefinitionSchema,
  type HttpPluginToolOperation,
  type PluginType,
  type ToolEffect
} from "@mcphub/core";

export type PluginManifest = ReturnType<typeof pluginManifestSchema.parse>;
export type PluginToolDefinition = ReturnType<typeof pluginToolDefinitionSchema.parse>;

export interface ApiToolDefinition extends PluginToolDefinition {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  operation: HttpPluginToolOperation;
}

export function definePlugin(input: unknown): PluginManifest {
  return pluginManifestSchema.parse(input);
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
  const tool = defineTool(input);
  return {
    ...tool,
    method: input.method,
    path: input.path,
    operation: {
      type: "http",
      method: input.method,
      path: input.path
    }
  };
}

export function pluginIdForType(type: PluginType, id: string): string {
  return `${type}.${id}`;
}
