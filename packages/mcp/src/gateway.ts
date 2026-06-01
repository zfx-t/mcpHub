import { z } from "zod";
import { sourceSearchFiltersSchema, toResourceUri } from "@mcphub/core";
import type { FeedItem } from "@mcphub/core";
import type { McpHubRepository } from "@mcphub/db";
import type { ExtractionService } from "@mcphub/extractors";

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

export class WebMcpGateway {
  constructor(
    private readonly repository: McpHubRepository,
    private readonly extraction: ExtractionService
  ) {}

  listResources(): McpResourceDescriptor[] {
    return [
      {
        uri: "webmcp://sources",
        name: "sources",
        title: "Sources",
        description: "Available Web to MCP sources.",
        mimeType: "application/json"
      }
    ];
  }

  async readResource(uri: string): Promise<McpContent[]> {
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
    return [
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
        throw new Error(`Unknown tool ${name}`);
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
