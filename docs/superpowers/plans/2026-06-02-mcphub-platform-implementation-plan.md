# MCPHub Platform Implementation Plan

Date: 2026-06-02
Source design: `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`

## Objective

Implement the approved MCPHub platform evolution: keep the existing Web content MCP functionality, add a plugin runtime, and allow trusted local REST/API plugins to expose existing services as MCP Tools with credential references, policy checks, and audit logs.

## Working Assumptions

- Continue using the existing TypeScript monorepo, pnpm workspaces, Fastify server, PostgreSQL repository, and official MCP SDK.
- Keep the existing `/mcp` endpoint and `/api/detect-site` API.
- Treat P0 plugins as trusted local/operator-provided code, not untrusted marketplace code.
- Implement manual API plugin definitions first; OpenAPI import is P1.
- Use JSON Schema/Zod validation at plugin, API connector, repository, and MCP boundaries.
- Prefer additive changes over rewriting the current Web content MVP.

## Target Package Shape

```text
packages/
|-- core/              # shared schemas, policy and error types
|-- db/                # platform schema + repositories
|-- plugins/           # plugin SDK, registry, runtime, built-in web plugin adapter
|-- api-connector/     # HTTP API execution, auth injection, redaction
|-- policy/            # policy engine and confirmation checks
|-- audit/             # audit event model/helpers if not folded into db/core
|-- mcp/               # MCP aggregation gateway
```

If extra packages create unnecessary overhead, `plugins`, `api-connector`, `policy`, and `audit` may be implemented as fewer packages, but their boundaries must remain clear.

## Phase 0: Plan Review and Baseline Protection

Deliverables:

- Confirm current branch and working tree.
- Re-run baseline checks before implementation.
- Identify existing MCP gateway seams for plugin aggregation.

Exit criteria:

- `pnpm typecheck`, `pnpm test`, and `pnpm test:e2e` pass before platform changes.
- Current Web content behavior is documented as regression-critical.

## Phase 1: Platform Domain Model

Deliverables:

- Core types and schemas for:
  - `Plugin`
  - `PluginTool`
  - `Credential`
  - `AuditRecord`
  - `ToolEffect`
  - platform error codes
- Validation for plugin IDs, tool names, effect values, and credential references.
- Tests for valid and invalid plugin manifests.

Implementation notes:

- Tool names should use `{domain}.{resource}.{action}`.
- `ToolEffect` values are `read`, `write`, and `dangerous`.
- Keep existing Web content Source/Rule/Document/FeedItem models intact.

Exit criteria:

- Unit tests cover manifest validation, tool naming, effect classification, and platform error schema.

## Phase 2: Database Schema and Repository

Deliverables:

- PostgreSQL schema additions for:
  - plugins
  - plugin tools
  - credentials or credential references
  - audit records
- In-memory repository support for tests.
- PostgreSQL repository support for platform records.

Implementation notes:

- Do not store raw secrets in audit logs.
- Credentials may use environment references in P0.
- Audit records should support blocked, failed, and successful calls.

Exit criteria:

- Repository tests cover CRUD/list operations for plugins, tools, credentials, and audit records.
- PostgreSQL JSONB fields use explicit serialization as established by the Docker fix.

## Phase 3: Plugin SDK and Registry

Deliverables:

- `definePlugin` helper.
- `defineApiTool` helper.
- Plugin manifest validation.
- Plugin Registry service for enabled built-in and local plugins.
- Built-in Web content plugin manifest wrapper.

Implementation notes:

- P0 plugin code is trusted local code.
- Registry should be able to list plugin tools for MCP aggregation.
- Built-in Web content plugin should preserve current Source/Rule/Document/FeedItem behavior.

Exit criteria:

- Unit tests can register a Web content plugin and a sample API plugin.
- Invalid plugin IDs, duplicate tool names, and invalid schemas are rejected.

## Phase 4: API Connector

Deliverables:

- HTTP request executor for JSON REST APIs.
- Path parameter, query parameter, header, and JSON body mapping.
- Supported auth modes:
  - bearer token
  - header API key
  - query API key
  - basic auth
  - static cookie
  - environment variable reference
- Timeout and structured remote error handling.
- Secret redaction utilities.

Implementation notes:

- Tests should use a local fixture HTTP server, not external network calls.
- Connector should return structured metadata: status code, duration, target URL without secrets.

Exit criteria:

- Unit/integration tests cover successful request, 4xx/5xx handling, timeout, auth injection, and redaction.

## Phase 5: Credential Store

Deliverables:

- Credential reference model.
- Environment-backed credential resolution.
- Optional database-backed credential metadata.
- Redaction integration with API Connector and Audit Log.

Implementation notes:

- P0 may store only metadata in DB and resolve actual secret values from environment variables.
- Public hosted encrypted storage is out of scope until stronger tenant isolation exists.

Exit criteria:

- Tests prove plugin source does not hardcode secrets and connector receives resolved credentials through host APIs.

## Phase 6: Policy Engine

Deliverables:

- Policy evaluation for `read`, `write`, and `dangerous`.
- Tool enabled/disabled checks.
- Allowed host/method/path restrictions.
- `CONFIRMATION_REQUIRED` response for dangerous tools without valid confirmation.

Implementation notes:

- Full confirmation UI is P1.
- P0 should block dangerous operations and record audit evidence.
- Read tools should be allowed when plugin and tool are enabled.

Exit criteria:

- Unit tests cover allowed read, denied disabled tool, denied policy, write grants, and dangerous confirmation-required behavior.

## Phase 7: Audit Logging

Deliverables:

- Audit record creation for every plugin tool call that reaches policy evaluation.
- Redacted input summaries.
- Status values for allowed, blocked, succeeded, failed, and policy-denied calls.
- MCP-readable audit resource such as `mcphub://audit/recent`.

Implementation notes:

- Audit logging should not expose raw credentials or full sensitive request bodies.
- Audit failures should be visible but should not silently hide tool execution status.

Exit criteria:

- Tests cover success, remote failure, policy denial, and dangerous operation blocking audit records.

## Phase 8: MCP Gateway Aggregation

Deliverables:

- MCP gateway can aggregate resources and tools from enabled plugins.
- Existing Web content resources/tools still work.
- API plugin tools appear in `tools/list`.
- `tools/call` routes to plugin runtime with policy, credentials, connector, and audit.
- Platform resources include:
  - `mcphub://plugins`
  - `mcphub://plugins/{pluginId}`
  - `mcphub://plugins/{pluginId}/tools`
  - `mcphub://audit/recent`

Implementation notes:

- Preserve current `/mcp` endpoint behavior and Streamable HTTP transport.
- Keep current Web content MCP resource URIs stable.

Exit criteria:

- MCP integration tests list Web content tools plus sample API plugin tools.
- MCP read tests cover plugin and audit resources.
- Existing MCP tests continue to pass.

## Phase 9: Sample Admin API Plugin

Deliverables:

- Fixture admin API server for tests.
- Sample plugin exposing at least:
  - `admin.users.list` as read
  - `admin.users.disable` as dangerous
- Documentation snippet showing how to write a plugin.

Implementation notes:

- The sample should model the user's admin backend use case.
- Dangerous operation should be blocked without confirmation in P0.

Exit criteria:

- `admin.users.list` succeeds through MCP and returns structured JSON.
- `admin.users.disable` returns `CONFIRMATION_REQUIRED` without a valid confirmation and writes an audit record.

## Phase 10: Configuration and Documentation

Deliverables:

- Environment variable documentation for plugin paths and credentials.
- README update explaining:
  - Web content plugin
  - API plugin
  - sample admin plugin
  - MCP testing commands
  - dangerous operation behavior
- `.env.example` updates.

Exit criteria:

- A fresh clone can run the existing Web content MCP behavior and sample API plugin behavior locally.

## Phase 11: End-to-End Validation

Deliverables:

- E2E smoke script extended to cover:
  1. server startup
  2. Web content resource read
  3. plugin list resource
  4. tools/list includes sample API tool
  5. `admin.users.list` succeeds
  6. `admin.users.disable` blocks without confirmation
  7. audit resource contains the blocked call
- Docker Compose validation for PostgreSQL mode.

Exit criteria:

- `pnpm typecheck` passes.
- `pnpm lint` passes.
- `pnpm test` passes.
- `pnpm build` passes.
- `pnpm test:e2e` passes.
- Docker Compose server starts and MCP plugin smoke checks pass.

## Review Checkpoints

- After Phase 1: confirm platform schemas and tool effect model.
- After Phase 3: confirm plugin SDK shape before connector/policy implementation.
- After Phase 6: confirm dangerous operation policy semantics.
- After Phase 8: confirm MCP aggregation shape.
- After Phase 11: confirm P0 acceptance before adding OpenAPI import or UI.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Platform scope becomes too broad | Keep P0 to trusted local plugins and manual REST mappings |
| Dangerous tools create unsafe agent behavior | Require effect metadata, policy checks, confirmation-required blocking, and audit logs |
| Plugin runtime becomes tightly coupled to Web extraction | Treat Web content as a built-in plugin and aggregate through shared interfaces |
| Credential leaks through logs or outputs | Centralize credential resolution and redaction in host APIs |
| OpenAPI import creates poor tool names | Defer import; start with explicit plugin code and naming conventions |
| Tests depend on external services | Use fixture HTTP servers and deterministic plugin tests |

## Out of Scope Until After P0

- Browser automation adapter.
- Public plugin marketplace.
- Plugin signing and third-party sandboxing.
- Full confirmation UI.
- OpenAPI import assistant.
- Multi-tenant hosted mode.
- Per-user delegated OAuth.
