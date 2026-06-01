# MCPHub

MCPHub turns supported web pages and sites into MCP-readable resources for agents. The MVP includes a server-side MCP gateway, a website detection API, a hybrid extraction engine, and a browser detector extension.

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
