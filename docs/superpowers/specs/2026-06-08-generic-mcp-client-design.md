# Generic MCP Client CLI Design

Date: 2026-06-08
Parent designs:
- `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`
- `docs/superpowers/specs/2026-06-07-dev-release-readiness-design.md`
- `docs/superpowers/specs/2026-06-07-plugin-developer-experience-design.md`

## Goal

Add a generic MCP client CLI that proves an external Agent-style client can connect to MCPHub through the public Streamable HTTP MCP endpoint.

The target is not a Claude, Cursor, or product-specific integration. The target is a protocol-level verification path:

```text
start MCPHub -> run generic client -> initialize -> discover resources/tools -> read status -> call a tool
```

This gives operators and plugin developers a stable baseline before they configure a real Agent host. If the generic client can connect, list capabilities, and call a tool, MCPHub's public MCP surface is usable.

## Current Baseline

MCPHub already exposes:

- Fastify HTTP server.
- Streamable HTTP MCP endpoint at `/mcp`.
- SDK-backed MCP server registration.
- Platform resources such as `mcphub://status`.
- Built-in web tools such as `source.search`.
- Plugin tools when local or built-in plugins are enabled.
- Smoke scripts that POST JSON-RPC requests to `/mcp`.

The current gap is packaging that capability as a user-facing MCP client workflow. Existing smoke scripts verify behavior for tests, but they are not shaped as a reusable command for operators, plugin authors, or future client documentation.

## Scope

This phase includes:

- A repo-local CLI script for generic Streamable HTTP MCP client operations.
- A package script such as `pnpm mcp:client`.
- Commands for inspect, resource listing, resource reading, tool listing, and tool calling.
- JSON and human-readable output modes.
- Error messages that explain common connection and protocol failures.
- Tests for parsing, response handling, error formatting, and a live MCPHub integration path.
- Documentation for using the generic client against local and Docker MCPHub instances.

This phase does not include:

- Claude Desktop, Claude Code, Cursor, or IDE-specific configuration.
- A full Agent framework or planning loop.
- Authentication or OAuth client behavior.
- Persistent MCP session management.
- stdio transport support.
- WebSocket or SSE-only transport support.
- Production distribution as a standalone npm package.

## Recommended Approach

Implement a small TypeScript CLI in `scripts/` and keep it intentionally external to MCPHub internals.

The CLI should call the public MCP endpoint over HTTP. It must not import `WebMcpGateway`, repository objects, plugin registries, or server internals. This boundary matters because the tool is meant to prove what a real external Agent can discover and call.

Use the same dependency style as existing scripts:

```bash
node --import tsx scripts/mcp-client.ts ...
```

The implementation can share small HTTP parsing helpers with smoke tests if that reduces duplication, but the CLI contract should be user-facing and documented separately from smoke behavior.

## Command Surface

Recommended package script:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
```

Supported commands:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
pnpm mcp:client --url http://127.0.0.1:3000/mcp list-resources
pnpm mcp:client --url http://127.0.0.1:3000/mcp read-resource --uri mcphub://status
pnpm mcp:client --url http://127.0.0.1:3000/mcp list-tools
pnpm mcp:client --url http://127.0.0.1:3000/mcp call-tool --name source.search --args '{}'
```

Arguments:

| Argument | Applies to | Meaning |
|----------|------------|---------|
| `--url` | all commands | Full MCP endpoint URL. Defaults to `http://127.0.0.1:3000/mcp`. |
| `--json` | all commands | Print raw normalized JSON instead of a human summary. |
| `--uri` | `read-resource` | MCP resource URI to read. |
| `--name` | `call-tool` | MCP tool name to call. |
| `--args` | `call-tool` | JSON object string used as tool arguments. Defaults to `{}`. |
| `--protocol-version` | all commands | MCP protocol version sent during initialize. Defaults to the version used by the current smoke tests. |

The command order places global flags before the subcommand to keep parsing simple and predictable.

## Inspect Behavior

`inspect` is the primary first-run command.

It should:

1. Send `initialize`.
2. Send `notifications/initialized` if the endpoint accepts notifications.
3. Call `resources/list`.
4. Call `tools/list`.
5. Read `mcphub://status`.
6. Print a concise summary.

Example human summary:

```text
MCPHub generic client inspect
Endpoint: http://127.0.0.1:3000/mcp
Initialize: ok
Resources: 6
Tools: 4
Status resource: ok
Platform status: ok
Repository: memory
Plugins loaded: 0
```

When plugin tools are visible, the summary should include plugin tool count and the first few tool names.

## MCP HTTP Flow

Each command uses the same client flow:

```text
parse CLI args
-> POST initialize
-> optionally POST notifications/initialized
-> POST target JSON-RPC method
-> parse JSON response or SSE event response
-> normalize result or error
-> print human summary or JSON
```

The CLI should send:

```http
Content-Type: application/json
Accept: application/json, text/event-stream
```

The first implementation can remain stateless because MCPHub currently uses a stateless Streamable HTTP transport. If MCPHub later enables sessions, the client helper can be extended to preserve and resend `Mcp-Session-Id`.

## Response Handling

The client should handle both JSON and event-stream responses.

For JSON:

- Parse the response body as JSON.
- Detect JSON-RPC `error`.
- Return the `result` for command-specific output.

For event-stream:

- Parse `data:` lines.
- Use the first JSON-RPC response event that matches the request.
- Detect JSON-RPC `error`.
- Surface malformed event data as a response parsing error with a short body excerpt.

This parsing should live in a small helper that can be unit tested without starting a server.

## Error Handling

Errors should be useful for someone trying to connect an Agent.

Recommended error categories:

| Situation | Message guidance |
|-----------|------------------|
| Network failure | Tell the user to check whether MCPHub is running and whether `--url` points to `/mcp`. |
| HTTP 404 or 405 | Tell the user the endpoint is probably wrong and should usually end with `/mcp`. |
| HTTP 429 | Tell the user the server rate limit was reached. |
| Initialize JSON-RPC error | Show JSON-RPC code/message/data and state that MCP handshake failed. |
| Tool not found | Suggest `list-tools`. |
| Resource not found | Suggest `list-resources`. |
| Invalid `--args` JSON | Show that `--args` must be a JSON object string. |
| Response parse failure | Show status, content type, and a redacted body excerpt. |

Secrets must not be printed. Since the generic client does not accept credential values in this phase, the main redaction requirement is to keep response excerpts short and avoid dumping large bodies.

## Documentation

Add a client guide:

```text
docs/clients/generic-mcp-client.md
```

The guide should cover:

- Starting MCPHub locally.
- Running `inspect`.
- Listing tools and resources.
- Reading `mcphub://status`.
- Calling `source.search`.
- Calling a plugin tool after setting `MCPHUB_PLUGIN_DIR`.
- Running against Docker Compose.
- Common failures and fixes.

README and `README_cn.md` should link to this guide from the MCP endpoint or verification sections.

## Testing Strategy

Unit tests:

- CLI argument parsing.
- `--args` JSON object validation.
- JSON-RPC success parsing.
- JSON-RPC error parsing.
- SSE response parsing.
- HTTP status error formatting.

Integration tests:

- Start an in-process MCPHub HTTP server.
- Run the CLI `inspect` command against `/mcp`.
- Run `list-tools`.
- Run `read-resource --uri mcphub://status`.
- Run `call-tool --name source.search --args '{}'`.

The integration test should prove the CLI uses HTTP rather than importing gateway internals.

Final verification should include:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
```

The last command requires a running dev server and should be documented as a manual running-instance verification unless it is wrapped by an automated test.

## Acceptance Criteria

This phase is complete when:

- `pnpm mcp:client ... inspect` verifies a running MCPHub instance through `/mcp`.
- A user can list resources and tools without reading source code.
- A user can read `mcphub://status`.
- A user can call `source.search` with JSON arguments.
- Common connection failures produce actionable errors.
- Documentation explains how this generic client proves Agent-facing MCP connectivity.
- Tests cover response parsing and at least one live MCPHub integration path.
