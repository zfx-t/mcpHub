import { defineApiTool, definePlugin } from "./sdk.js";

export const sampleAdminPlugin = definePlugin({
  id: "sample-admin",
  name: "Sample Admin API",
  version: "0.1.0",
  type: "api",
  description: "Expose a fixture admin user API as MCP tools.",
  homepage: "https://example.com/sample-admin",
  author: "MCPHub",
  license: "MIT",
  tags: ["admin", "users"],
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["http", "credentials", "policy", "audit", "plugin-config"]
  },
  configSchema: {
    type: "object",
    required: ["baseUrl"],
    properties: {
      baseUrl: { type: "string", format: "uri" }
    }
  },
  credentials: [{ id: "admin-token", type: "bearer", description: "Admin API bearer token." }],
  tools: [
    defineApiTool({
      name: "admin.users.list",
      description: "List backend users.",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number" },
          query: { type: "string" }
        }
      },
      effect: "read",
      method: "GET",
      path: "/api/users",
      credentialRefs: ["admin-token"]
    }),
    defineApiTool({
      name: "admin.users.disable",
      description: "Disable a backend user.",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
          reason: { type: "string" }
        }
      },
      effect: "dangerous",
      method: "POST",
      path: "/api/users/{id}/disable",
      requiresConfirmation: true,
      credentialRefs: ["admin-token"]
    })
  ]
});
