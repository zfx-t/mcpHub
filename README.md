# MCPHub

[中文文档](README_cn.md)

MCPHub is a self-hostable middleware platform for turning existing web content, REST APIs, admin backends, and trusted local integration code into MCP resources and tools.

The project is inspired by the RSSHub style of extensibility: run one service, add local adapters/plugins, and expose a consistent interface to clients. MCPHub focuses on MCP-native output for AI agents rather than RSS feeds.

## What It Does

- Exposes a Streamable HTTP MCP endpoint at `/mcp`.
- Converts web content sources into MCP-readable resources and tools.
- Loads trusted local plugins from `MCPHUB_PLUGIN_DIR`.
- Supports declarative HTTP tools for one-request REST operations.
- Supports executor tools for multi-step workflows implemented in plugin code.
- Resolves credentials from environment variables.
- Applies tool policy for `read`, `write`, and `dangerous` effects.
- Records audit evidence for plugin tool calls.
- Provides runtime status and plugin diagnostics for operators.

## Requirements

- Node.js 25 or newer
- pnpm 10
- Docker, for PostgreSQL and Docker Compose verification

## Quick Start

Install dependencies and run the local in-memory server:

```bash
pnpm install
REQUEST_LOGGING=false pnpm dev
```

In another terminal, verify the running instance:

```bash
pnpm dev:smoke
```

The server starts at:

```text
http://localhost:3000
```

The MCP endpoint is:

```text
http://localhost:3000/mcp
```

Verify the MCP endpoint with the generic client:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
```

Generic client setup and troubleshooting are documented in [docs/clients/generic-mcp-client.md](docs/clients/generic-mcp-client.md).

## Project Homepage

MCPHub also includes an independent static homepage app for introducing the project and its developer workflow:

```bash
pnpm --filter @mcphub/web dev
pnpm --filter @mcphub/web build
```

The homepage lives in `apps/web` and is separate from the MCP/API server in `apps/server`.

## Docker Dev Stack

Start the Docker Compose stack with PostgreSQL and the built-in sample admin plugin enabled:

```bash
SAMPLE_ADMIN_API_BASE_URL=http://host.docker.internal:4001 \
SAMPLE_ADMIN_API_TOKEN=dev-token \
docker compose up --build -d server
```

Verify the running Docker instance:

```bash
pnpm docker:smoke
```

`docker:smoke` checks server liveness, PostgreSQL mode, MCP discovery, plugin tool visibility, and blocked dangerous-call audit evidence.

Detailed deployment instructions are in [docs/deployment/dev.md](docs/deployment/dev.md).

## Operator Diagnostics

Health:

```bash
curl http://localhost:3000/healthz
```

Runtime status:

```bash
curl http://localhost:3000/api/status
```

Plugin diagnostics:

```bash
curl http://localhost:3000/api/plugins
```

Agent-readable status is also available through MCP:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"mcphub://status"}}'
```

More troubleshooting notes are in [docs/operations/diagnostics.md](docs/operations/diagnostics.md).

## MCP Surface

Supported JSON-RPC MCP methods:

- `initialize`
- `resources/list`
- `resources/read`
- `tools/list`
- `tools/call`

Platform resources:

- `mcphub://status`
- `mcphub://plugins`
- `mcphub://plugins/{pluginId}`
- `mcphub://plugins/{pluginId}/tools`
- `mcphub://audit/recent`

Web content resources:

- `webmcp://sources`
- `webmcp://sources/{sourceId}`
- `webmcp://sources/{sourceId}/items`
- `webmcp://items/{itemId}`
- `webmcp://rules/{ruleId}/diagnostics`

Built-in web tools:

- `source.search`
- `source.refresh`
- `extract.preview`
- `debug.explain`

Plugin tools appear in `tools/list` when their plugins are loaded and enabled.

## Local Plugins

Local plugins are trusted server-side JavaScript modules. Each plugin directory contains:

```text
plugins/
  my-admin/
    index.js
    plugin.config.json
```

Start MCPHub with a plugin directory:

```bash
MCPHUB_PLUGIN_DIR=/absolute/path/to/plugins pnpm dev
```

Create a plugin skeleton:

```bash
pnpm plugin:create my-admin --template http-api --tool-name my.admin.users.list
pnpm plugin:verify examples/plugins/my-admin
```

Use the executor template for multi-step workflow tools:

```bash
pnpm plugin:create my-workflow --template executor --tool-name my.workflow.jobs.run
pnpm plugin:verify examples/plugins/my-workflow
```

The full plugin authoring guide is in [docs/plugins/development.md](docs/plugins/development.md). The reference plugin standard is in [docs/plugins/standard.md](docs/plugins/standard.md).

## HTTP API Plugin Example

```js
export default {
  id: "admin-users",
  name: "Admin Users",
  version: "0.1.0",
  type: "api",
  description: "Expose admin user APIs.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["http", "credentials", "policy", "plugin-config"]
  },
  credentials: [{ id: "admin-token", type: "bearer" }],
  tools: [
    {
      name: "admin.users.list",
      description: "List backend users.",
      inputSchema: {
        type: "object",
        properties: { page: { type: "number" } }
      },
      effect: "read",
      credentialRefs: ["admin-token"],
      operation: { type: "http", method: "GET", path: "/api/users" }
    }
  ]
};
```

Example `plugin.config.json`:

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

## Executor Plugins

Executor tools are for workflows where one MCP call needs plugin-owned code, such as validation, multiple API calls, uploads, polling, and result normalization.

An executor tool declares:

```js
executor: { type: "module", handler: "runWorkflow" }
```

The handler receives a controlled runtime context:

- `context.config`
- `context.credentials.resolve(id)`
- `context.http.get/post/put/patch/delete`
- `context.checkpoint(step, summary)`
- `context.logger`

A runnable executor demo is available in:

```text
examples/plugins/fake-upload/
```

Verify it end to end:

```bash
pnpm test:plugin
```

## Tool Policy

Each plugin tool declares an effect:

- `read`: read-only operation
- `write`: mutation
- `dangerous`: destructive, high-risk, or permission-changing operation

Local plugin policy controls dangerous tools:

- `block`: return `CONFIRMATION_REQUIRED` and do not call the remote service.
- `auditOnly`: execute and record dangerous policy evidence.
- `allow`: execute and record normal audit evidence.

MCPHub is middleware. In many deployments, the MCP client or agent host owns final tool approval. MCPHub preserves effect metadata and audit evidence so that approval systems can make informed decisions.

## Verification

Common checks:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm test:plugin
```

Running-instance checks:

```bash
pnpm dev:smoke
pnpm docker:smoke
```

Docker Compose config check:

```bash
docker compose config
```

## Repository Layout

```text
apps/
  server/          Fastify server and HTTP/MCP entrypoints
  extension/       Browser detector extension

packages/
  core/            Shared schemas and domain types
  db/              Memory and PostgreSQL repositories
  extractors/      Web content extraction
  mcp/             MCP gateway and SDK server
  plugins/         Plugin SDK, registry, local loader
  api-connector/   REST execution and redaction
  credentials/     Environment-backed credential store
  policy/          Tool policy evaluation
  audit/           Tool-call audit logger

scripts/           Smoke tests, fixtures, plugin CLI
docs/              Deployment, operations, plugin, design, and plan docs
examples/plugins/  Runnable example plugins
```

## Release

Current release: `v0.1.0`

This first dev release focuses on making MCPHub deployable, inspectable, and verifiable as a middleware platform.
