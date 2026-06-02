import { definePlugin } from "./sdk.js";

export const webContentPlugin = definePlugin({
  id: "web-content",
  name: "Web Content",
  version: "0.1.0",
  type: "web_content",
  description: "Built-in Web content extraction and MCP resource adapter.",
  tools: [
    {
      name: "source.search",
      description: "Search available Web content Sources.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          filters: { type: "object" }
        }
      },
      effect: "read"
    },
    {
      name: "source.refresh",
      description: "Refresh a Web content Source.",
      inputSchema: {
        type: "object",
        required: ["sourceId"],
        properties: {
          sourceId: { type: "string" },
          mode: { type: "string" }
        }
      },
      effect: "write"
    },
    {
      name: "extract.preview",
      description: "Run preview extraction without writing cached content.",
      inputSchema: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string" },
          sourceId: { type: "string" }
        }
      },
      effect: "read"
    },
    {
      name: "debug.explain",
      description: "Explain extraction path, confidence, warnings, and failures.",
      inputSchema: {
        type: "object",
        properties: {
          sourceId: { type: "string" },
          itemId: { type: "string" }
        }
      },
      effect: "read"
    }
  ]
});
