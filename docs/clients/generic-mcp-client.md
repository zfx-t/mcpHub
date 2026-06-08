# Generic MCP Client

This guide shows how to verify MCPHub through its public Streamable HTTP MCP endpoint without depending on a product-specific Agent client.

Use this first when you want to prove that an Agent can connect to MCPHub, discover resources and tools, and call a tool over MCP.

## Start MCPHub

For local in-memory development:

```bash
pnpm install
REQUEST_LOGGING=false pnpm dev
```

The MCP endpoint is:

```text
http://127.0.0.1:3000/mcp
```

## Inspect A Running Instance

In another terminal:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
```

Expected shape:

```text
MCPHub generic client inspect
Endpoint: http://127.0.0.1:3000/mcp
Initialize: ok
Resources: 5
Tools: 4
Status resource: ok
Platform status: ok
Repository: memory
Plugins loaded: 0
```

`inspect` performs a real MCP workflow:

```text
initialize -> notifications/initialized -> resources/list -> tools/list -> resources/read mcphub://status
```

## List Resources

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp list-resources
```

Use JSON output when another script should consume the result:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp --json list-resources
```

The client times out each HTTP request after 10000ms by default. Override it when testing slow networks:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp --timeout-ms 30000 inspect
```

## Read Status

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp read-resource --uri mcphub://status
```

This reads the same Agent-facing status resource that a real MCP client can read.

## List Tools

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp list-tools
```

The default in-memory instance should include built-in tools such as:

```text
source.search
source.refresh
extract.preview
debug.explain
```

## Call A Tool

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp call-tool --name source.search --args '{}'
```

Pass tool arguments as a JSON object string:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp call-tool \
  --name source.search \
  --args '{"query":"example"}'
```

## Verify Plugin Tools

Create and verify a local plugin:

```bash
pnpm plugin:create my-admin --template http-api --tool-name my.admin.users.list
pnpm plugin:verify examples/plugins/my-admin
```

Start MCPHub with the plugin directory:

```bash
MCPHUB_PLUGIN_DIR=examples/plugins \
MY_ADMIN_TOKEN=replace-me \
REQUEST_LOGGING=false \
pnpm dev
```

Then inspect tools:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
pnpm mcp:client --url http://127.0.0.1:3000/mcp list-tools
```

Plugin tools appear in `tools/list` when their plugin is loaded and enabled.

## Docker Compose

Start the Docker dev stack:

```bash
SAMPLE_ADMIN_API_BASE_URL=http://host.docker.internal:4001 \
SAMPLE_ADMIN_API_TOKEN=dev-token \
docker compose up --build -d server
```

Verify the container:

```bash
pnpm docker:smoke
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
```

## Common Failures

| Symptom | What to check |
|---------|---------------|
| Network failure | Confirm MCPHub is running and the port is correct. |
| HTTP 404 or 405 | Use the MCP endpoint URL, usually ending with `/mcp`. |
| HTTP 429 | The server rate limit was reached; wait or adjust `FETCH_RATE_LIMIT_PER_MINUTE`. |
| Request timeout | Confirm the server is responsive, or retry with a larger `--timeout-ms`. |
| `initialize` JSON-RPC error | Confirm the server supports the requested protocol version. |
| Tool not found | Run `list-tools` and check whether the plugin was loaded. |
| Resource not found | Run `list-resources` and check the URI. |
| Invalid `--args` JSON | Use a JSON object string such as `'{}'`, not an array or bare string. |

## Why This Exists

`pnpm dev:smoke` and `pnpm docker:smoke` are test-oriented health checks. `pnpm mcp:client` is the user-facing generic client path. It proves that MCPHub is reachable from outside the server process through the same `/mcp` endpoint that Agent hosts use.
