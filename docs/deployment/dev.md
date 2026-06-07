# Dev Deployment

This guide starts a self-hosted MCPHub dev instance and verifies that it is usable as MCP middleware.

## Local In-Memory

Use this mode for quick development. It does not require PostgreSQL.

```bash
pnpm install
REQUEST_LOGGING=false pnpm dev
```

In another terminal:

```bash
pnpm dev:smoke
```

The smoke command checks `/healthz`, `/api/status`, MCP `initialize`, `resources/list`, `tools/list`, and `mcphub://status`.

## Local PostgreSQL

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Start the server against PostgreSQL:

```bash
DATABASE_URL=postgres://mcphub:mcphub@localhost:5432/mcphub \
REQUEST_LOGGING=false \
pnpm dev
```

Verify the instance:

```bash
pnpm dev:smoke
```

## Docker Compose

Start the full dev stack:

```bash
SAMPLE_ADMIN_API_BASE_URL=http://host.docker.internal:4001 \
SAMPLE_ADMIN_API_TOKEN=dev-token \
docker compose up --build -d server
```

Verify the running container:

```bash
pnpm docker:smoke
```

`docker:smoke` expects the server at `http://127.0.0.1:3000`, verifies PostgreSQL mode, verifies a plugin tool is registered, calls a dangerous sample admin tool, and confirms the blocked call appears in `mcphub://audit/recent`.

The smoke uses `admin.users.disable`, which is blocked by MCPHub policy before any remote admin API call is made. The sample admin base URL only needs to be configured so the plugin is registered.

Override the URL with:

```bash
MCPHUB_BASE_URL=http://127.0.0.1:3000 pnpm docker:smoke
```

## Plugin-Enabled Dev

Generate or prepare a local plugin directory:

```bash
pnpm plugin:create my-admin --template http-api --out examples/plugins --tool-name my.admin.users.list
pnpm plugin:verify examples/plugins/my-admin
```

Start MCPHub with the plugin directory:

```bash
MCPHUB_PLUGIN_DIR=examples/plugins \
MY_ADMIN_TOKEN=replace-me \
REQUEST_LOGGING=false \
pnpm dev
```

Inspect the loaded plugins:

```bash
curl http://localhost:3000/api/plugins
```

Inspect the MCP-visible status:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"mcphub://status"}}'
```

## MCP Client Endpoint

Configure MCP clients that support Streamable HTTP to use:

```text
http://localhost:3000/mcp
```

The server supports:

- `initialize`
- `resources/list`
- `resources/read`
- `tools/list`
- `tools/call`

## Useful Verification Commands

```bash
pnpm typecheck
pnpm test
pnpm test:plugin
pnpm test:e2e
pnpm dev:smoke
pnpm docker:smoke
docker compose config
```
