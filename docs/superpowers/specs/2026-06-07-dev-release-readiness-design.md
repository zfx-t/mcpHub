# Dev Release Readiness Design

Date: 2026-06-07
Parent designs:
- `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`
- `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`
- `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md`
- `docs/superpowers/specs/2026-06-07-plugin-developer-experience-design.md`

## Goal

Turn MCPHub from a working platform prototype into a usable dev release that can be deployed, checked, and operated as MCP middleware.

The target is similar to RSSHub's project shape: a self-hostable service with clear runtime configuration, extension points, diagnostics, and repeatable verification. Developers should be able to run MCPHub, mount local plugins, expose non-MCP services as MCP tools/resources, and know whether the instance is healthy without reading internal source code.

This phase prioritizes two things:

1. Deployment usability.
2. Platform visibility and diagnostics.

It does not continue optimizing a specific business plugin. The purpose is to make the platform itself usable as a dev version.

## Current Baseline

The project already has the core middleware foundation:

- A Fastify server and MCP HTTP endpoint.
- Dockerfile and Docker Compose with PostgreSQL.
- Web-to-MCP resources and tools.
- Local plugin loading through `MCPHUB_PLUGIN_DIR`.
- HTTP API tools and custom executor tools.
- Environment-backed credentials.
- Tool policy for `read`, `write`, and `dangerous` effects.
- Audit records.
- Example plugin verification through `pnpm test:plugin`.
- Plugin developer commands:
  - `pnpm plugin:create`
  - `pnpm plugin:verify`

The missing dev-release layer is not plugin expressiveness. The missing layer is a reliable operator path:

```text
configure -> start -> inspect -> verify -> connect MCP client -> debug failures
```

## Scope

This phase includes:

- A documented dev deployment path for local and Docker Compose modes.
- A complete environment configuration reference for dev/self-host use.
- A platform status surface that summarizes runtime health and plugin state.
- Diagnostics for plugin loading, registered MCP tools/resources, and audit availability.
- Repeatable smoke commands for local and Docker dev instances.
- README and docs that explain how to start, verify, connect, and troubleshoot the instance.
- Tests that protect the diagnostics and verification behavior.

This phase does not include:

- Admin web UI.
- Public plugin marketplace.
- Remote plugin installation or update management.
- Multi-tenant authentication or billing.
- Production hardening for untrusted third-party plugins.
- Full observability stack such as Prometheus, tracing, or log shipping.
- Browser automation for websites without APIs.
- More real-world business plugin examples.

## Target User

There are two target users for this phase.

The operator wants to deploy MCPHub as middleware and answer:

- Is the server alive?
- Is the database connected?
- Which plugins were loaded?
- Which plugins failed, and why?
- Which MCP tools/resources are visible to an agent?
- Did recent tool calls succeed, fail, or get blocked?

The plugin developer wants to answer:

- Did MCPHub load my plugin from disk?
- Did my config and credentials bind correctly?
- Is my tool visible in `tools/list`?
- Can I run a smoke command before connecting an AI client?

## Recommended Approach

Use a combined deployment-readiness and diagnostics approach.

Only improving Docker and README would make startup easier but leave failures opaque. Only adding diagnostics would still make the first run too hard to reproduce. Combining both creates a dev release that can be evaluated by someone outside the implementation loop.

The implementation should stay intentionally small:

- Use existing Fastify HTTP routes where HTTP is appropriate.
- Use existing MCP resources where agent-readable diagnostics are useful.
- Reuse the current plugin loader diagnostics instead of inventing a second diagnostic model.
- Reuse existing smoke scripts where possible.
- Avoid introducing UI or a new operational framework.

## Runtime Configuration

The dev release should document and validate the configuration needed to run MCPHub.

Required or supported variables:

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP server port. |
| `DATABASE_URL` | PostgreSQL connection string. If absent, server uses in-memory mode. |
| `MCPHUB_PLUGIN_DIR` | Directory containing local plugin subdirectories. |
| `SAMPLE_ADMIN_API_BASE_URL` | Enables the built-in sample admin plugin when set. |
| `SAMPLE_ADMIN_API_TOKEN` | Inline sample admin token for local smoke use. |
| `SAMPLE_ADMIN_API_TOKEN_ENV` | Environment variable name for sample admin token. |
| Plugin-specific secret env vars | Values referenced by `plugin.config.json` secret refs. |

Configuration documentation should distinguish:

- local in-memory development
- local PostgreSQL development
- Docker Compose development
- plugin-enabled development

Secrets must not be printed in status responses or startup summaries.

## Platform Status Surface

The dev release should expose a concise platform status surface for humans and agents.

Recommended HTTP route:

```text
GET /api/status
```

Recommended MCP resource:

```text
mcphub://status
```

The status payload should include:

- server status
- version when available
- repository mode: `memory` or `postgres`
- database health when PostgreSQL is configured
- plugin directory path presence, without exposing secrets
- loaded plugin count
- disabled plugin count
- plugin diagnostic count
- registered MCP tool count
- registered MCP resource count
- recent audit availability

The status payload should avoid raw environment dumps. It should be a curated operational summary.

## Plugin Diagnostics

The existing local loader already produces diagnostics. This phase should make those diagnostics easy to inspect at runtime.

Recommended HTTP route:

```text
GET /api/plugins
```

Recommended MCP resources:

```text
mcphub://plugins
mcphub://plugins/{pluginId}
mcphub://plugins/{pluginId}/tools
```

The existing plugin resources should be reviewed and extended only where necessary. A user should be able to see:

- plugin ID
- name
- version
- type
- enabled/disabled state
- source: built-in or local
- local plugin directory when applicable
- tool names
- tool effects
- execution mode: HTTP or executor
- diagnostics that explain skipped or broken plugins

Diagnostics should use actionable messages. For example:

- missing `index.js`
- invalid `plugin.config.json`
- credential requirement has no binding
- executor handler is missing
- plugin is disabled by config

## MCP Visibility

The dev release should make it obvious what an AI client can discover.

The status and diagnostics surface should expose summaries for:

- `resources/list`
- `tools/list`
- platform resources
- web content resources
- plugin tools

This does not require changing the MCP protocol behavior. It requires making the current registration state inspectable and documented.

## Verification Commands

The dev release should provide repeatable checks for common operating modes.

Recommended commands:

```bash
pnpm typecheck
pnpm test
pnpm test:plugin
pnpm dev:smoke
pnpm docker:smoke
```

If script names differ during implementation, the final docs should expose a small and memorable command set.

Expected verification coverage:

- server starts
- `/healthz` succeeds
- `/api/status` succeeds
- MCP `initialize` succeeds
- MCP `resources/list` includes platform resources
- MCP `tools/list` includes expected built-in/plugin tools
- example plugin can be loaded and called
- audit records are available after tool calls
- Docker Compose mode can start and pass the same platform checks

The smoke commands should fail with clear messages and non-zero exit codes.

## Documentation

Documentation should be reorganized around the operator journey.

Recommended docs:

```text
docs/deployment/dev.md
docs/operations/diagnostics.md
```

The README should become the short entry point:

1. What MCPHub is.
2. Quick start.
3. Docker dev start.
4. Verify the instance.
5. Load a plugin.
6. Connect an MCP client.
7. Where to read more.

Detailed plugin authoring remains in:

```text
docs/plugins/development.md
```

## Error Handling

Status and diagnostics endpoints should not crash because one plugin is broken. A broken plugin should be represented as a diagnostic item, while the server continues to expose healthy plugins and built-in resources.

Rules:

- Missing plugin directory is not fatal.
- Broken local plugin is not fatal.
- Missing required database connection is fatal only when `DATABASE_URL` is explicitly configured and cannot be used.
- Missing plugin credential binding disables or breaks that plugin/tool with diagnostics, not the whole server.
- Secrets are always redacted.

## Testing Strategy

Add focused tests for:

- status payload shape
- redaction behavior
- plugin diagnostic exposure
- tool/resource count summaries
- status behavior with no plugin directory
- status behavior with a disabled or broken plugin
- smoke script success and failure paths where practical

Existing test suites should continue to pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm test:plugin
pnpm build
docker compose config
```

Docker runtime smoke should be part of final manual verification for this phase.

## Acceptance Criteria

The phase is complete when:

1. A fresh developer can start MCPHub locally from README instructions.
2. A fresh developer can start MCPHub with Docker Compose from README instructions.
3. `/healthz` confirms process liveness.
4. `/api/status` or equivalent confirms platform readiness.
5. MCP `mcphub://status` or equivalent exposes agent-readable status.
6. Plugin loading diagnostics are visible without reading server logs.
7. Registered MCP tools/resources are inspectable.
8. Existing example plugin verification still passes.
9. Docker dev smoke proves server, database, MCP endpoint, plugin state, and audit path.
10. Documentation explains how to troubleshoot common failures:
    - port already used
    - PostgreSQL unavailable
    - plugin directory missing
    - plugin disabled
    - invalid plugin config
    - missing credential env var

## Follow-Up Work

After this dev release layer is complete, good next phases are:

- RSSHub-style plugin/route contribution standard.
- Plugin package format and version compatibility policy.
- OpenAPI import for common REST APIs.
- Optional admin UI for status, plugins, and audit.
- Production deployment hardening.
- Public plugin registry or marketplace.
