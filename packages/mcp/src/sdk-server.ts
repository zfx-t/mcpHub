import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { McpHubRepository } from "@mcphub/db";
import type { ExtractionService } from "@mcphub/extractors";
import { WebMcpGateway } from "./gateway.js";

export function createSdkMcpServer(repository: McpHubRepository, extraction: ExtractionService): McpServer {
  const gateway = new WebMcpGateway(repository, extraction);
  const server = new McpServer(
    { name: "mcphub", version: "0.1.0" },
    { capabilities: { resources: {}, tools: {} } }
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

  return server;
}

function toSdkContent(contents: Array<{ text: string }>) {
  return contents.map((content) => ({ type: "text" as const, text: content.text }));
}
