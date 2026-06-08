# Plugin Executor Runtime Implementation Plan

Date: 2026-06-03
Source design: `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md`
Parent plan: `docs/superpowers/plans/2026-06-03-local-plugin-loading-implementation-plan.md`

## Objective

Implement MCPHub P2 plugin executor runtime so trusted local plugins can define custom handler functions for multi-step workflows while keeping existing declarative HTTP tools backward compatible.

The implementation should prove the design with a fake upload workflow plugin, not a real Bilibili integration.

## Working Assumptions

- Continue using the TypeScript monorepo and official MCP SDK.
- Keep existing P1 local plugin loading behavior stable.
- Existing `operation.type = "http"` tools must continue to work without manifest changes.
- Executor plugins are trusted local server-side code. P2 does not add a hostile-code sandbox.
- The current startup `PluginRegistry` and loaded module handlers are the execution authority.
- Secrets remain environment-backed and must not appear in MCP resources, tool results, or audit summaries unless the plugin explicitly returns non-secret data.
- Implementation starts only after this design and plan are reviewed and approved.

## Target Code Shape

```text
packages/core/src/
|-- types.ts              # add executor operation/tool types
|-- schemas.ts            # validate executor tool definitions

packages/plugins/src/
|-- sdk.ts                # defineExecutorTool, handler/context types
|-- registry.ts           # expose handler-aware loaded plugin metadata if needed
|-- local-loader.ts       # retain module handlers with manifests
|-- local-loader.test.ts

packages/mcp/src/
|-- gateway.ts            # route executor tools to executor runtime
|-- executor-runtime.ts   # handler invocation and context assembly
|-- executor-runtime.test.ts
|-- gateway.test.ts

packages/audit/src/
|-- logger.ts             # support checkpoint/step audit evidence
|-- logger.test.ts

packages/api-connector/src/
|-- connector.ts          # reuse for context.http where possible

scripts/
|-- smoke.ts              # add fake multi-step executor plugin smoke
```

If a new file would grow too broad, split narrowly by responsibility:

- runtime invocation
- context construction
- HTTP helper
- audit checkpoint helper

## Phase 0: Baseline and Branch Protection

Deliverables:

- Confirm branch, working tree, and remote state.
- Run baseline checks:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
- Record baseline in `progress.md`.

Exit criteria:

- Baseline passes, or any existing failure is documented before implementation.
- No unrelated changes are reverted.

## Phase 1: Core Tool Schema

Deliverables:

- Extend core types to represent executor-backed tools:

```ts
interface ModulePluginToolExecutor {
  type: "module";
  handler: string;
}
```

- Allow a plugin tool to declare either:
  - `operation` for declarative HTTP execution
  - `executor` for custom handler execution
- Reject tools that define both or neither.

Implementation notes:

- Keep existing HTTP operation schema unchanged.
- Preserve all existing `PluginTool` fields: `effect`, `credentialRefs`, `inputSchema`, `enabled`, `requiresConfirmation`.

Exit criteria:

- Core schema tests cover HTTP-only, executor-only, both-defined invalid, and neither-defined invalid tools.
- Existing plugin fixtures still validate.

## Phase 2: Plugin SDK Executor API

Deliverables:

- Add `defineExecutorTool()` helper.
- Add public TypeScript types for:
  - executor input
  - executor result
  - `PluginExecutorContext`
  - `PluginHandler`
  - plugin handlers map
- Support plugin manifests with `handlers`.

Implementation notes:

- Prefer a manifest shape where handlers live in the default export:

```ts
export default definePlugin({
  ...
  handlers: {
    async uploadVideo(input, context) {}
  }
});
```

- If schema validation cannot validate functions directly, validate the manifest data and keep handlers in a parallel runtime-only object.

Exit criteria:

- SDK tests prove users can define an executor tool and a matching handler.
- Missing handler names are caught by loader or registry diagnostics.

## Phase 3: Local Loader Handler Retention

Deliverables:

- Extend `LocalPluginLoadResult` with runtime handler metadata.
- Keep handlers in memory for the current process.
- Do not persist handler functions to the repository.
- Diagnose:
  - executor tool references missing handler
  - handler value is not a function
  - duplicate tool names
  - disabled plugin before import behavior remains intact

Implementation notes:

- The repository still stores safe plugin and tool metadata.
- Runtime handler availability must come from the current loaded module.
- Removing or disabling a plugin must prevent executor calls even if old rows remain in the database.

Exit criteria:

- Loader tests cover valid handler, missing handler, invalid handler, disabled plugin, and broken module behavior.

## Phase 4: Platform Composition

Deliverables:

- Extend `PlatformGatewayOptions` with loaded executor handlers.
- Update `createPlatformServices()` to pass local plugin handlers to MCP gateway.
- Keep built-in sample admin plugin behavior unchanged.

Implementation notes:

- Built-in sample admin can remain declarative HTTP.
- No built-in executor plugin is required outside tests.

Exit criteria:

- App/platform tests prove both declarative HTTP tools and executor tools can be registered together.

## Phase 5: Executor Runtime Context

Deliverables:

- Add `packages/mcp/src/executor-runtime.ts`.
- Implement handler invocation:
  - validate handler exists
  - assemble context
  - invoke handler
  - normalize result
  - catch and normalize errors
- Implement `context.config`.
- Implement `context.credentials.resolve(requirementId)`.
- Implement `context.http` helper for JSON requests.
- Implement `context.checkpoint(step, summary)`.
- Implement `context.logger`.

Implementation notes:

- Reuse `ApiConnector` redaction and timeout behavior.
- Context HTTP should honor plugin `config.baseUrl`.
- Credential resolution should use existing `getCredentialForRequirement()` and `EnvironmentCredentialStore`.
- `context.checkpoint()` should never include raw secrets.

Exit criteria:

- Runtime unit tests cover successful handler execution, missing handler, thrown plugin error, missing credential, missing baseUrl, checkpoint audit, and redaction.

## Phase 6: Gateway Routing

Deliverables:

- Update `WebMcpGateway.callPlatformTool()`:
  - HTTP operation tools continue through existing API Connector path.
  - Executor tools route through executor runtime.
- Policy evaluation remains before any remote call or handler execution.
- Dangerous `block` prevents handler invocation.
- Dangerous `auditOnly` and `allow` execute and audit policy mode.

Implementation notes:

- Avoid duplicating policy code by factoring shared policy/audit setup if needed.
- Do not reintroduce repository fallback as execution authority.

Exit criteria:

- Gateway tests prove:
  - executor tool appears in `tools/list`
  - executor tool returns handler result
  - dangerous block prevents handler and remote calls
  - auditOnly executes and records policy mode
  - stale repository executor tool cannot run

## Phase 7: Step Audit Evidence

Deliverables:

- Decide and implement the smallest audit extension for checkpoints.
- Option A: write checkpoint records as existing audit records with status `allowed` or `succeeded` and step metadata in `inputSummary`.
- Option B: add `step` metadata to audit records.
- Option C: add a separate `audit_steps` table.

Recommendation:

- Use Option B if it is a small schema change.
- Use Option A if schema churn becomes too broad.
- Defer Option C until workflows need richer timeline queries.

Exit criteria:

- Audit tests prove checkpoint summaries are recorded, redacted, ordered, and visible through `mcphub://audit/recent`.

## Phase 8: Fake Multi-Step Upload Fixture

Deliverables:

- Add a test-only local plugin fixture with one executor tool:

```text
fixture.upload.video
```

- The handler should:
  - validate input
  - call fixture endpoint to create upload session
  - call fixture endpoint for two upload parts
  - call fixture endpoint to submit
  - call fixture endpoint to poll status
  - return normalized `{ ok, uploadId, status }`

Implementation notes:

- Use small text payloads or metadata instead of real video files.
- Keep network calls against local fixture server only.
- Include a `dryRun` input branch that validates and returns a plan without remote mutations.

Exit criteria:

- Unit or integration test proves remote fixture received the expected sequence.
- Dry run performs no remote mutation calls.

## Phase 9: Smoke and Docker Validation

Deliverables:

- Extend `scripts/smoke.ts` with a temp local executor plugin.
- Verify through real MCP calls:
  - `tools/list` includes executor tool
  - `tools/call` runs multi-step workflow
  - audit includes checkpoints
  - dangerous block behavior prevents workflow
- If feasible, extend Docker smoke with mounted executor plugin.

Exit criteria:

- `pnpm test:e2e` passes locally.
- `docker compose config` still passes.
- Docker runtime smoke is run if the implementation touches container runtime assumptions.

## Phase 10: Documentation

Deliverables:

- Update README with:
  - HTTP vs executor tool comparison
  - executor plugin example
  - context API reference
  - checkpoint/audit example
  - dry run guidance
  - trust boundary warning
- Update `.env.example` only if new environment variables are introduced.

Exit criteria:

- A user can write a simple executor plugin from README alone.

## Phase 11: Final Verification and Review

Deliverables:

- Run:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm test:e2e`
  - `docker compose config`
  - `git diff --check`
- Perform code review focused on:
  - execution authority
  - secret redaction
  - audit completeness
  - backward compatibility
  - plugin failure isolation

Exit criteria:

- All required checks pass.
- Planning files are updated.
- Commits are split by function:
  - core/SDK/loader executor schema
  - runtime/gateway/audit execution path
  - smoke/docs/planning updates

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Executor handlers can run arbitrary trusted code | Document local plugin trust boundary; do not claim sandboxing |
| Secrets leak through plugin return values | Redact platform-owned audit/log fields; document that plugins must not intentionally return secrets |
| Multi-step workflows produce unclear audit logs | Add checkpoint API and require tests for step evidence |
| Executor path bypasses policy | Evaluate policy before handler invocation and test dangerous block |
| Stale persisted tools become executable | Keep current startup registry and handler map as execution authority |
| Upload workflows become too broad | P2 fixture uses simplified upload; durable resumable uploads are deferred |

## Deferred Work

- Durable background jobs and resumable workflow state.
- Full file upload abstraction for large binaries.
- Visual workflow editor.
- OpenAPI/Postman generation of executor templates.
- Browser automation plugins.
- Sandboxed untrusted plugin runtime.
- Public plugin marketplace.

