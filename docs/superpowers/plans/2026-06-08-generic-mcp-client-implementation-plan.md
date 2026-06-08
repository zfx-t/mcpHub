# Generic MCP Client CLI Implementation Plan

Date: 2026-06-08
Design: `docs/superpowers/specs/2026-06-08-generic-mcp-client-design.md`

## Goal

Implement a generic Streamable HTTP MCP client CLI that verifies MCPHub's public `/mcp` endpoint as an external Agent-style client would.

The completed feature should let a user run:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
```

and see whether the running MCPHub instance can initialize, list resources, list tools, read `mcphub://status`, and call tools through the public MCP protocol.

## Constraints

- The CLI must call MCPHub over HTTP. It must not import `WebMcpGateway`, repositories, platform services, plugin registries, or server internals.
- The first implementation remains Streamable HTTP only.
- The first implementation remains stateless and does not manage `Mcp-Session-Id`.
- Product-specific client setup for Claude, Cursor, or IDEs is out of scope.
- Existing smoke scripts may share parsing helpers only if the user-facing CLI contract stays separate and clear.
- Error output must be actionable and must avoid dumping large response bodies.

## Phase 0: Baseline And Worktree Protection

Tasks:

- Confirm current branch and worktree state.
- Read the design document and current script/test patterns.
- Run a quick baseline:
  - `pnpm typecheck`
  - focused existing script tests if needed
- Confirm no unrelated user changes are included in the implementation commit.

Exit criteria:

- Work starts from a known branch state.
- Existing relevant checks pass or any pre-existing failures are recorded before edits.

## Phase 1: Package Script And CLI Entry

Tasks:

- Add `mcp:client` to root `package.json`.
- Add `scripts/mcp-client.ts` as the executable entry.
- Add a small CLI usage/help output.
- Support global arguments before the command:
  - `--url`
  - `--json`
  - `--protocol-version`
- Support subcommands:
  - `inspect`
  - `list-resources`
  - `read-resource`
  - `list-tools`
  - `call-tool`

Exit criteria:

- `pnpm mcp:client --help` prints usable help.
- Unknown commands and unknown options fail with clear messages.

## Phase 2: Argument Parser And Validation

Tasks:

- Implement a parser module, likely `scripts/mcp-client/common.ts`.
- Validate `--url` as a URL string.
- Validate `read-resource --uri`.
- Validate `call-tool --name`.
- Parse `call-tool --args` as a JSON object string.
- Default `--url` to `http://127.0.0.1:3000/mcp`.
- Default `--args` to `{}`.
- Default protocol version to the version currently used by smoke tests.

Exit criteria:

- Parser can be unit tested without network access.
- Invalid arguments produce deterministic error messages.

## Phase 3: HTTP JSON-RPC Client Helper

Tasks:

- Implement a small Streamable HTTP JSON-RPC helper.
- Always send:
  - `Content-Type: application/json`
  - `Accept: application/json, text/event-stream`
- Implement `initialize`.
- Implement best-effort `notifications/initialized`.
- Implement generic `request(method, params)`.
- Handle network failures separately from HTTP response failures.

Exit criteria:

- Helper can call any MCP JSON-RPC method through the configured endpoint.
- It remains independent from MCPHub server internals.

## Phase 4: Response Parsing

Tasks:

- Parse `application/json` JSON-RPC responses.
- Parse `text/event-stream` responses by reading `data:` lines.
- Detect JSON-RPC `error` objects and expose code/message/data.
- Return normalized success objects to command handlers.
- Keep malformed body excerpts short.

Exit criteria:

- JSON and SSE parsing are covered by unit tests.
- JSON-RPC errors do not look like successful command output.

## Phase 5: Command Handlers

Tasks:

- Implement `list-resources`.
- Implement `read-resource`.
- Implement `list-tools`.
- Implement `call-tool`.
- Implement `inspect` as the high-level verification command:
  - initialize
  - initialized notification
  - resources/list
  - tools/list
  - resources/read `mcphub://status`
  - summary output

Exit criteria:

- Each command works against a running MCPHub instance.
- `inspect` gives a concise status summary useful to operators and plugin authors.

## Phase 6: Output Formatting And Errors

Tasks:

- Add human-readable summary output for each command.
- Add `--json` output mode with normalized JSON.
- Add actionable errors for:
  - network failure
  - HTTP 404/405 wrong endpoint
  - HTTP 429 rate limit
  - initialize failure
  - tool not found
  - resource not found
  - invalid `--args`
  - malformed response
- Ensure CLI exits non-zero on failures.

Exit criteria:

- Users can diagnose the most common connection failures without reading source code.
- Error tests cover important cases.

## Phase 7: Automated Tests

Tasks:

- Add `scripts/mcp-client.test.ts`.
- Unit test:
  - argument parsing
  - JSON args validation
  - JSON success parsing
  - JSON-RPC error parsing
  - SSE success parsing
  - HTTP error formatting
- Integration test:
  - start an in-process MCPHub app
  - run CLI code against the HTTP `/mcp` endpoint
  - verify `inspect`
  - verify `list-tools`
  - verify `read-resource --uri mcphub://status`
  - verify `call-tool --name source.search --args '{}'`

Exit criteria:

- Tests prove the client uses HTTP and does not bypass the public endpoint.
- `pnpm test` includes the new coverage.

## Phase 8: Documentation

Tasks:

- Add `docs/clients/generic-mcp-client.md`.
- Document:
  - starting MCPHub locally
  - running `inspect`
  - listing resources and tools
  - reading `mcphub://status`
  - calling `source.search`
  - checking plugin tools when `MCPHUB_PLUGIN_DIR` is set
  - Docker Compose usage
  - common failures and fixes
- Update `README.md` with a short link to the guide.
- Update `README_cn.md` with the same link in Chinese.

Exit criteria:

- A user can follow the guide without reading implementation files.
- README points users toward the generic client as the first Agent-facing verification path.

## Phase 9: Final Verification And Commits

Tasks:

- Run:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm test:e2e`
  - `pnpm test:plugin`
  - `git diff --check`
- Start a dev server and manually verify:
  - `pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect`
  - `pnpm mcp:client --url http://127.0.0.1:3000/mcp list-tools`
  - `pnpm mcp:client --url http://127.0.0.1:3000/mcp read-resource --uri mcphub://status`
  - `pnpm mcp:client --url http://127.0.0.1:3000/mcp call-tool --name source.search --args '{}'`
- Split commits by function if implementation size grows:
  - client CLI and parser
  - client tests
  - docs

Exit criteria:

- All required checks pass.
- The final response includes exact commands users can run.
- The worktree is clean or only contains explicitly identified user-owned changes.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| CLI accidentally depends on MCPHub internals | Keep helper under `scripts/mcp-client/` and review imports; integration tests must use HTTP endpoint. |
| SSE parsing is too permissive | Unit test valid and malformed event-stream bodies. |
| Error output dumps too much data | Limit excerpts and avoid printing environment values. |
| Stateless transport changes later | Keep session behavior isolated in the HTTP helper so `Mcp-Session-Id` can be added later. |
| Command syntax becomes hard to remember | Keep command set small and document examples in README and client guide. |

## Acceptance Checklist

- [x] `pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect` works against a running MCPHub instance.
- [x] `list-resources`, `read-resource`, `list-tools`, and `call-tool` work.
- [x] `--json` works for command output.
- [x] Common failures produce actionable messages.
- [x] Tests cover parser, response parsing, errors, and live HTTP integration.
- [x] `docs/clients/generic-mcp-client.md` exists and is linked from both README files.
- [x] Final verification commands pass.
