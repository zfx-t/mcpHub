import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHubRepository } from "@mcphub/db";
import type { ExtractionService } from "@mcphub/extractors";
import { WebMcpGateway } from "./gateway.js";
import type { PlatformGatewayOptions } from "./gateway.js";

export function createSdkMcpServer(repository: McpHubRepository, extraction: ExtractionService, platform?: PlatformGatewayOptions): McpServer {
  const gateway = new WebMcpGateway(repository, extraction, platform);
  const server = new McpServer(
    { name: "mcphub", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } }
  );

  server.registerResource(
    "status",
    "mcphub://status",
    {
      title: "MCPHub Status",
      description: "Runtime status, plugin diagnostics summary, and MCP visibility.",
      mimeType: "application/json"
    },
    async (uri) => ({ contents: await gateway.readResource(uri.toString()) })
  );

  server.registerResource(
    "sources",
    "webmcp://sources",
    {
      title: "Sources",
      description: "Available Web to MCP sources.",
      mimeType: "application/json"
    },
    async (uri) => ({ contents: await gateway.readResource(uri.toString()) })
  );

  if (platform?.registry) {
    server.registerResource(
      "plugins",
      "mcphub://plugins",
      {
        title: "Plugins",
        description: "Enabled MCPHub plugins.",
        mimeType: "application/json"
      },
      async (uri) => ({ contents: await gateway.readResource(uri.toString()) })
    );

    server.registerResource(
      "audit-recent",
      "mcphub://audit/recent",
      {
        title: "Recent Audit Records",
        description: "Recent plugin tool call audit records.",
        mimeType: "application/json"
      },
      async (uri) => ({ contents: await gateway.readResource(uri.toString()) })
    );
  }

  server.registerResource(
    "source",
    new ResourceTemplate("webmcp://sources/{sourceId}", { list: undefined }),
    {
      title: "Source",
      description: "Source summary, health, refresh policy, and diagnostics.",
      mimeType: "application/json"
    },
    async (uri) => ({ contents: await gateway.readResource(uri.toString()) })
  );

  server.registerResource(
    "source-items",
    new ResourceTemplate("webmcp://sources/{sourceId}/items", { list: undefined }),
    {
      title: "Source items",
      description: "Latest FeedItems for a Source.",
      mimeType: "application/json"
    },
    async (uri) => ({ contents: await gateway.readResource(uri.toString()) })
  );

  server.registerResource(
    "item",
    new ResourceTemplate("webmcp://items/{itemId}", { list: undefined }),
    {
      title: "Item",
      description: "Full item and linked Document content.",
      mimeType: "application/json"
    },
    async (uri) => ({ contents: await gateway.readResource(uri.toString()) })
  );

  server.registerResource(
    "rule-diagnostics",
    new ResourceTemplate("webmcp://rules/{ruleId}/diagnostics", { list: undefined }),
    {
      title: "Rule diagnostics",
      description: "Rule diagnostics and extraction confidence.",
      mimeType: "application/json"
    },
    async (uri) => ({ contents: await gateway.readResource(uri.toString()) })
  );

  server.registerTool(
    "source.search",
    {
      title: "Search Sources",
      description: "Search available Sources.",
      inputSchema: {
        query: z.string().optional(),
        filters: z
          .object({
            visibility: z.enum(["public", "private"]).optional(),
            healthStatus: z.enum(["healthy", "degraded", "failing", "unknown"]).optional(),
            hostname: z.string().optional()
          })
          .optional()
      }
    },
    async (args) => ({ content: toSdkContent(await gateway.callTool("source.search", args)) })
  );

  server.registerTool(
    "source.refresh",
    {
      title: "Refresh Source",
      description: "Refresh a Source.",
      inputSchema: {
        sourceId: z.string(),
        mode: z.enum(["cached", "force", "validate_only"]).optional()
      }
    },
    async (args) => ({ content: toSdkContent(await gateway.callTool("source.refresh", args)) })
  );

  server.registerTool(
    "extract.preview",
    {
      title: "Preview Extraction",
      description: "Run preview extraction without writing cached content.",
      inputSchema: {
        url: z.string().url(),
        sourceId: z.string().optional()
      }
    },
    async (args) => ({ content: toSdkContent(await gateway.callTool("extract.preview", args)) })
  );

  server.registerTool(
    "debug.explain",
    {
      title: "Explain Extraction",
      description: "Explain extraction path, confidence, warnings, and failures.",
      inputSchema: {
        sourceId: z.string().optional(),
        itemId: z.string().optional()
      }
    },
    async (args) => ({ content: toSdkContent(await gateway.callTool("debug.explain", args)) })
  );

  for (const tool of platform?.registry?.listPluginTools() ?? []) {
    if (!tool.enabled || ["source.search", "source.refresh", "extract.preview", "debug.explain"].includes(tool.name)) {
      continue;
    }
    server.registerTool(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: zodShapeFromJsonSchema(tool.inputSchema)
      },
      async (args: Record<string, unknown>) => ({ content: toSdkContent(await gateway.callTool(tool.name, args)) })
    );
  }

  return server;
}

function toSdkContent(contents: Array<{ text: string }>) {
  return contents.map((content) => ({ type: "text" as const, text: content.text }));
}

function zodShapeFromJsonSchema(schema: Record<string, unknown>): Record<string, z.ZodTypeAny> {
  const properties = isRecord(schema.properties) ? schema.properties : {};
  const required = Array.isArray(schema.required) ? new Set(schema.required.filter((entry): entry is string => typeof entry === "string")) : new Set<string>();
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [key, value] of Object.entries(properties)) {
    const field = zodFieldFromJsonSchema(isRecord(value) ? value : {});
    shape[key] = required.has(key) ? field : field.optional();
  }
  return shape;
}

function zodFieldFromJsonSchema(schema: Record<string, unknown>): z.ZodTypeAny {
  switch (schema.type) {
    case "string":
      return z.string();
    case "number":
      return z.number();
    case "integer":
      return z.number().int();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(z.unknown());
    case "object":
      return z.record(z.unknown());
    default:
      return z.unknown();
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
