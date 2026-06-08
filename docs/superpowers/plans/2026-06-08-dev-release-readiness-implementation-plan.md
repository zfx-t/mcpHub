# Dev Release Readiness Implementation Plan

Date: 2026-06-08
Source design: `docs/superpowers/specs/2026-06-07-dev-release-readiness-design.md`
Parent designs:
- `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`
- `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`
- `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md`
- `docs/superpowers/specs/2026-06-07-plugin-developer-experience-design.md`

## Objective

Implement the first usable MCPHub dev release layer: a self-hostable middleware instance that can be started, inspected, verified, and debugged without reading the internal source code.

The implementation should deliver:

- a platform status surface for HTTP users and MCP clients
- runtime plugin diagnostics exposed through stable APIs/resources
- clear summaries of registered MCP resources/tools
- repeatable local and Docker smoke commands
- dev deployment and diagnostics documentation
- tests that protect status, diagnostics, redaction, and smoke behavior

This plan does not implement an admin UI, plugin marketplace, remote plugin installation, multi-tenant auth, production hardening for untrusted plugins, browser automation, or more business-specific plugin examples.

## Working Assumptions

- Continue using the current Fastify server and official MCP SDK HTTP endpoint.
- Preserve all current MCP resources and tools.
- Reuse existing plugin loader diagnostics instead of creating a second diagnostic system.
- Treat local plugins as trusted operator-provided code.
- Keep HTTP status APIs small and curated; do not expose raw environment variables or secrets.
- Keep agent-readable diagnostics available through MCP resources where useful.
- Implementation starts only after this plan is reviewed and approved.
- The untracked local directories `examples/plugins/my-admin/` and `examples/plugins/my-workflow/` are user experiments and must not be deleted, overwritten, or committed unless explicitly requested.

## Target Code Shape

```text
apps/server/src/
|-- app.ts                 # register status/plugins HTTP routes
|-- platform.ts            # return runtime summary/diagnostics from platform composition
|-- config.ts              # expose curated config mode information if needed
|-- app.test.ts            # status and diagnostics route coverage

packages/mcp/src/
|-- gateway.ts             # expose mcphub://status if implemented in gateway
|-- gateway.test.ts        # MCP status/resource visibility coverage

packages/plugins/src/
|-- local-loader.ts        # preserve/extend diagnostics shape if needed
|-- local-loader.test.ts   # diagnostics detail coverage if behavior changes

scripts/
|-- smoke.ts               # keep e2e coverage and reuse helpers where possible
|-- dev-smoke.ts           # local running-instance smoke, if separate script is clearer
|-- docker-smoke.ts        # Docker Compose running-instance smoke, if separate script is clearer
|-- smoke-helpers.ts       # optional shared MCP/HTTP smoke helpers

docs/
|-- deployment/dev.md
|-- operations/diagnostics.md

README.md
package.json
.env.example
```

The exact file split can change if the existing code shape makes a smaller edit cleaner. Avoid creating new packages for this phase.

## Phase 0: Baseline and Scope Protection

Deliverables:

- Confirm branch, remote state, and working tree.
- Record that `examples/plugins/my-admin/` and `examples/plugins/my-workflow/` are untracked user experiments.
- Run or document baseline checks:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:plugin`
  - `pnpm test:e2e`
  - `docker compose config`

Implementation notes:

- Do not push unless requested.
- Do not rewrite existing commits.
- If a baseline check fails for an unrelated pre-existing reason, record it in `progress.md` before implementing.

Exit criteria:

- Baseline status is recorded.
- No unrelated worktree changes are reverted or committed.

## Phase 1: Runtime Status Model

Deliverables:

- Define a small internal status summary model that can be returned by HTTP and MCP surfaces.
- Include:
  - service status
  - app version when available
  - repository mode: `memory` or `postgres`
  - database health when `DATABASE_URL` is configured
  - plugin directory configured flag and safe path summary
  - loaded plugin count
  - disabled plugin count
  - plugin diagnostic count
  - registered MCP tool count
  - registered MCP resource count
  - audit availability summary

Implementation notes:

- Prefer deriving counts from existing registry/gateway data instead of duplicating state.
- If repository mode is not explicitly tracked today, add the smallest stable indicator at server composition time.
- Never include raw secret values.
- Avoid dumping `process.env`.

Exit criteria:

- Status model can be built for:
  - in-memory mode
  - PostgreSQL-configured mode
  - no plugin directory
  - plugin directory with loaded/disabled/broken plugins

## Phase 2: HTTP Status and Plugin Diagnostics APIs

Deliverables:

- Add:

```text
GET /api/status
GET /api/plugins
```

- `/api/status` returns the curated platform status model.
- `/api/plugins` returns loaded plugin summaries and loader diagnostics.

Implementation notes:

- `/healthz` should remain a simple liveness check.
- `/api/status` should be readiness/diagnostic oriented, but it should not fail just because a plugin is broken.
- Broken local plugins should appear as diagnostics.
- Redact or omit secret refs where exposing the exact env var name would be undesirable. If the current docs rely on env var names for troubleshooting, expose only non-secret references and never values.

Exit criteria:

- Route tests cover status success.
- Route tests cover plugin diagnostics with at least one broken or disabled plugin.
- Secrets are not exposed in JSON responses.

## Phase 3: MCP Status Resource

Deliverables:

- Add an agent-readable status resource:

```text
mcphub://status
```

- Ensure existing platform resources remain available:

```text
mcphub://plugins
mcphub://plugins/{pluginId}
mcphub://plugins/{pluginId}/tools
mcphub://audit/recent
```

Implementation notes:

- Prefer returning JSON text with `application/json` MIME type, matching existing resource patterns if present.
- The resource should expose the same curated model as `/api/status` or a compatible subset.
- Keep `resources/list` stable and predictable.

Exit criteria:

- Gateway tests prove `resources/list` includes `mcphub://status`.
- Gateway tests prove `resources/read` returns status JSON.
- Existing plugin and web resources continue to pass tests.

## Phase 4: MCP Visibility Summary

Deliverables:

- Make status or diagnostics include summaries of what an MCP client can discover:
  - platform resource count/names where practical
  - web resource availability
  - plugin tool names
  - tool effect
  - execution mode: HTTP or executor

Implementation notes:

- Do not change MCP protocol behavior just to support this summary.
- Prefer a compact summary rather than returning full schema for every tool.
- Tool input schemas should remain available through `tools/list`, not duplicated wholesale in `/api/status`.

Exit criteria:

- Tests prove summaries include plugin tool name, effect, and execution mode.
- Summary works when there are no plugins.

## Phase 5: Smoke Command Set

Deliverables:

- Add package scripts for a small dev verification command set:

```json
{
  "dev:smoke": "...",
  "docker:smoke": "..."
}
```

- Implement smoke coverage for a running local instance:
  - `/healthz`
  - `/api/status`
  - MCP `initialize`
  - MCP `resources/list`
  - MCP `tools/list`
  - status resource read
  - plugin/audit resource availability where configured

- Implement Docker dev smoke:
  - start or assume Docker Compose server as documented
  - check server, PostgreSQL-backed mode, MCP endpoint, plugin state, and audit path

Implementation notes:

- Reuse code from `scripts/smoke.ts` where possible.
- It is acceptable to keep `pnpm test:e2e` as the full in-process smoke and use `dev:smoke` for a running instance if that distinction is documented.
- Commands should fail with non-zero exit codes and clear messages.
- Avoid requiring arbitrary user plugin directories for default smoke. Use existing example plugin behavior where needed.

Exit criteria:

- `pnpm dev:smoke` verifies a running dev server.
- `pnpm docker:smoke` verifies a Docker Compose dev server.
- Failure output tells the user which check failed.

## Phase 6: Documentation and Environment Reference

Deliverables:

- Add:

```text
docs/deployment/dev.md
docs/operations/diagnostics.md
```

- Update:
  - `README.md`
  - `.env.example`
  - package script references

Documentation must cover:

- local in-memory start
- local PostgreSQL start
- Docker Compose start
- plugin-enabled start through `MCPHUB_PLUGIN_DIR`
- how to run smoke checks
- how to connect an MCP client to `/mcp`
- how to inspect `/api/status`
- how to inspect plugin diagnostics
- common failure cases:
  - port already used
  - PostgreSQL unavailable
  - plugin directory missing
  - plugin disabled
  - invalid plugin config
  - missing credential env var

Implementation notes:

- README should stay concise and point to detailed docs.
- Docs should use commands that can be run from the repository root.
- Do not instruct users to commit generated plugin experiments.

Exit criteria:

- A fresh reader can follow README to start and verify MCPHub.
- Detailed docs explain how to diagnose common dev failures.

## Phase 7: Test and Regression Coverage

Deliverables:

- Add/extend tests for:
  - status payload shape
  - redaction behavior
  - plugin diagnostic exposure
  - disabled plugin visibility
  - broken plugin does not crash server
  - MCP status resource
  - tool/resource visibility summaries

Implementation notes:

- Use focused unit/integration tests before broad e2e checks.
- Keep fixtures temp-dir based for plugin diagnostics.
- Avoid depending on external network.

Exit criteria:

- Focused tests cover the new behavior.
- Existing plugin developer CLI tests still pass.

## Phase 8: Final Verification

Deliverables:

- Run final verification:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
pnpm test:plugin
pnpm dev:smoke
pnpm docker:smoke
docker compose config
git diff --check
```

Implementation notes:

- `pnpm dev:smoke` requires a running local server. If implemented as a self-contained smoke that starts its own server, document that behavior.
- `pnpm docker:smoke` may require Docker Compose services to be running or may start them itself. The final implementation should choose one behavior and document it.
- If Docker is unavailable in the environment, record the failure clearly and still run all non-Docker checks.

Exit criteria:

- Verification results are recorded in `progress.md`.
- Any skipped or failed check has a concrete reason.

## Phase 9: Commit and Handoff

Deliverables:

- Split commits by function where practical:
  1. status and diagnostics runtime
  2. smoke command set
  3. docs and environment reference
  4. tests/fixes if not already grouped
- Update `task_plan.md`, `progress.md`, and `findings.md`.
- Summarize:
  - what changed
  - how to run the dev version
  - how to verify it
  - any residual limitations

Implementation notes:

- Do not include untracked user plugin experiments unless explicitly requested.
- Keep the final response concise but include command names and doc paths.

Exit criteria:

- Working tree is clean except intentionally untracked user files.
- The user has a clear next action for running or reviewing the dev release.

## Acceptance Criteria Mapping

| Design criterion | Implementation phases |
|------------------|-----------------------|
| Fresh developer can start locally | Phase 6, Phase 8 |
| Fresh developer can start with Docker Compose | Phase 5, Phase 6, Phase 8 |
| `/healthz` confirms liveness | Phase 5, Phase 8 |
| `/api/status` confirms readiness | Phase 1, Phase 2 |
| `mcphub://status` exposes agent-readable status | Phase 3 |
| Plugin diagnostics visible without logs | Phase 2, Phase 3 |
| Registered MCP tools/resources inspectable | Phase 4 |
| Example plugin verification still passes | Phase 8 |
| Docker dev smoke covers server/database/MCP/plugin/audit | Phase 5, Phase 8 |
| Troubleshooting docs cover common failures | Phase 6 |
