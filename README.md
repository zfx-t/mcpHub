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

Credentials are metadata in the repository and resolve secrets from environment variables:

```text
ADMIN_TOKEN=replace-me
```

`read` and `write` tools can run when the plugin and tool are enabled. `dangerous` tools use the plugin policy mode:

- `block`: return `CONFIRMATION_REQUIRED` and do not call the remote API.
- `auditOnly`: call the remote API and write audit evidence that the tool was dangerous.
- `allow`: call the remote API and write normal audit evidence.

The built-in sample admin plugin defaults to `block` to preserve the original P0 safety behavior. Local plugins default to `auditOnly`, because MCPHub is middleware and the MCP client or agent host often owns final approval.

## Local Plugin Loading

Set `MCPHUB_PLUGIN_DIR` to load trusted, precompiled ESM plugins from disk:

```bash
MCPHUB_PLUGIN_DIR=/opt/mcphub/plugins pnpm dev
```

Each child directory is one plugin:

```text
/opt/mcphub/plugins/
  admin-users/
    index.js
    plugin.config.json
```

`index.js` must default-export a plugin manifest. It can be generated from TypeScript during your plugin build, or bundled as plain JavaScript:

```js
export default {
  id: "admin-users",
  name: "Admin Users",
  version: "0.1.0",
  type: "api",
  description: "Expose admin user APIs.",
  credentials: [{ id: "admin-token", type: "bearer" }],
  tools: [
    {
      name: "admin.users.list",
      description: "List backend users.",
      inputSchema: { type: "object", properties: { page: { type: "number" } } },
      effect: "read",
      credentialRefs: ["admin-token"],
      operation: { type: "http", method: "GET", path: "/api/users" }
    }
  ]
};
```

`plugin.config.json` binds deployment-specific config, credentials, and policy:

```json
{
  "enabled": true,
  "config": {
    "baseUrl": "https://admin.example.com"
  },
  "credentials": {
    "admin-token": {
      "type": "bearer",
      "secretRef": "env:ADMIN_TOKEN"
    }
  },
  "policy": {
    "dangerousMode": "auditOnly"
  }
}
```

Local plugins are trusted server-side code. MCPHub validates manifest/config shape and skips broken plugins with diagnostics, but it does not sandbox hostile JavaScript. For plugins mounted outside this repo, prefer bundling runtime dependencies into the plugin output or exporting a plain manifest object so module resolution does not depend on the MCPHub workspace.

Verify a local plugin with MCP:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

Then call one of the listed plugin tools:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"admin.users.list","arguments":{"page":1}}}'
```

Troubleshooting:

- Plugin not listed: confirm `MCPHUB_PLUGIN_DIR` points to a directory and each plugin has `index.js` plus `plugin.config.json`.
- Invalid manifest: check the startup diagnostic log for `manifest_validation_error`.
- Missing credential: ensure `secretRef` points to an environment variable available to the server, such as `env:ADMIN_TOKEN`.
- Dangerous tool blocked: set `"dangerousMode": "auditOnly"` or `"allow"` in `plugin.config.json` when your MCP client already owns approval.

For Docker Compose, mount a host plugin directory and set the container path:

```bash
MCPHUB_PLUGIN_HOST_DIR=/absolute/path/to/plugins \
MCPHUB_PLUGIN_DIR=/opt/mcphub/plugins \
LOCAL_ADMIN_API_TOKEN=replace-me \
docker compose up --build -d server
```

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
