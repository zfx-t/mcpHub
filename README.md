# MCPHub

MCPHub turns existing web content and REST/admin APIs into MCP-readable resources and tools for agents. The platform keeps the Web-to-MCP gateway and adds a trusted local plugin model for exposing existing backend APIs without changing the original service.

## Requirements

- Node.js 25 or newer
- pnpm 10
- Docker, for local PostgreSQL

## Local Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm dev
```

The server defaults to seeded in-memory data when `DATABASE_URL` is not set.

## PostgreSQL Mode

Start PostgreSQL for local development:

```bash
docker compose up -d postgres
```

Run the server with:

```bash
DATABASE_URL=postgres://mcphub:mcphub@localhost:5432/mcphub pnpm dev
```

On startup the server applies `packages/db/src/schema.sql` and seeds sample Sources and Rules.

Run the full self-host stack:

```bash
docker compose up --build server
```

## HTTP API

Health:

```bash
curl http://localhost:3000/healthz
```

Detect a site:

```bash
curl -X POST http://localhost:3000/api/detect-site \
  -H 'content-type: application/json' \
  -d '{"url":"https://example.com/articles/hello","hostname":"example.com"}'
```

## MCP Endpoint

The MVP exposes a JSON-RPC MCP-compatible endpoint at:

```text
http://localhost:3000/mcp
```

Supported methods:

- `initialize`
- `resources/list`
- `resources/read`
- `tools/list`
- `tools/call`

Platform resources are available when plugins are registered:

- `mcphub://plugins`
- `mcphub://plugins/{pluginId}`
- `mcphub://plugins/{pluginId}/tools`
- `mcphub://audit/recent`

Existing Web resources remain stable:

- `webmcp://sources`
- `webmcp://sources/{sourceId}`
- `webmcp://sources/{sourceId}/items`
- `webmcp://items/{itemId}`
- `webmcp://rules/{ruleId}/diagnostics`

## API Plugins

API plugins are trusted local code. A plugin maps an existing REST operation to an MCP tool:

```ts
import { defineApiTool, definePlugin } from "@mcphub/plugins";

export default definePlugin({
  id: "admin-users",
  name: "Admin Users",
  version: "0.1.0",
  type: "api",
  description: "Expose admin user APIs.",
  configSchema: {
    type: "object",
    required: ["baseUrl"],
    properties: { baseUrl: { type: "string", format: "uri" } }
  },
  credentials: [{ id: "admin-token", type: "bearer" }],
  tools: [
    defineApiTool({
      name: "admin.users.list",
      description: "List backend users.",
      inputSchema: { type: "object", properties: { page: { type: "number" } } },
      effect: "read",
      method: "GET",
      path: "/api/users",
      credentialRefs: ["admin-token"]
    }),
    defineApiTool({
      name: "admin.users.disable",
      description: "Disable a backend user.",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      effect: "dangerous",
      method: "POST",
      path: "/api/users/{id}/disable",
      credentialRefs: ["admin-token"]
    })
  ]
});
```

Credentials are metadata in the repository and resolve secrets from environment variables in P0:

```text
ADMIN_TOKEN=replace-me
```

`read` tools can run when the plugin and tool are enabled. `write` tools require an explicit policy grant. `dangerous` tools return `CONFIRMATION_REQUIRED` unless a matching confirmation policy is configured, and blocked calls are written to the audit log.

Enable the sample admin plugin in the server with:

```bash
SAMPLE_ADMIN_API_BASE_URL=http://localhost:4001 \
SAMPLE_ADMIN_API_TOKEN_ENV=SAMPLE_ADMIN_API_TOKEN \
SAMPLE_ADMIN_API_TOKEN=replace-me \
pnpm dev
```

For Docker Compose smoke testing against a host fixture:

```bash
pnpm fixture:admin
SAMPLE_ADMIN_API_BASE_URL=http://host.docker.internal:4001 \
SAMPLE_ADMIN_API_TOKEN=replace-me \
docker compose up --build -d server
```

## Browser Extension

Build the detector extension:

```bash
pnpm --filter @mcphub/extension build
```

Load `apps/extension/dist` as an unpacked Manifest V3 extension. The extension reads only lightweight public page metadata and calls `/api/detect-site`.

## Verification

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```
