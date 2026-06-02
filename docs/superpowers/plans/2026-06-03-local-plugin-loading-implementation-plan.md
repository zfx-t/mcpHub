# Local Plugin Loading Implementation Plan

Date: 2026-06-03
Source design: `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`
Parent plan: `docs/superpowers/plans/2026-06-02-mcphub-platform-implementation-plan.md`

## Objective

Implement MCPHub P1 local plugin loading so operators can place trusted, precompiled JavaScript plugins in `MCPHUB_PLUGIN_DIR`, configure each plugin with `plugin.config.json`, and expose those plugin tools through the existing MCP platform gateway.

This plan also changes dangerous tool behavior from the current fixed P0 server-side block to a configurable policy mode: `block`, `auditOnly`, or `allow`, with `auditOnly` as the default for local plugins.

## Working Assumptions

- Continue using the existing TypeScript monorepo and official MCP SDK.
- Keep the current `/mcp` endpoint, Web MCP resources, platform resources, and sample admin plugin behavior available.
- Treat local plugins as trusted operator-provided code. P1 validates shape and configuration, but does not sandbox hostile JavaScript.
- Local plugins are precompiled ESM JavaScript modules with a default export that validates as `PluginManifest`.
- The local plugin directory is opt-in through `MCPHUB_PLUGIN_DIR`.
- One manifest ID maps to one local plugin instance in P1. Multi-instance support is deferred.
- Secrets remain environment-backed through `env:NAME` references. Raw secret values must not be written to resources or audit logs.
- No implementation starts until this plan is reviewed and approved.

## Target Code Shape

```text
apps/server/src/
|-- config.ts              # add MCPHUB_PLUGIN_DIR and sample/default policy config if needed
|-- platform.ts            # compose built-in sample + local plugin load result

packages/plugins/src/
|-- local-loader.ts        # filesystem scanner, dynamic import, config validation
|-- local-loader.test.ts   # temp-dir based loader tests
|-- registry.ts            # preserve duplicate checks while accepting local manifests
|-- sdk.ts                 # keep manifest contract stable

packages/policy/src/
|-- engine.ts              # dangerousMode support
|-- engine.test.ts         # block/auditOnly/allow coverage

packages/mcp/src/
|-- gateway.ts             # pass per-plugin policy, enrich audit metadata
|-- gateway.test.ts        # local plugin and policy integration tests

scripts/
|-- smoke.ts               # extend or add local plugin smoke path
```

If the loader needs server-only Node APIs, it should live in `packages/plugins` only if that package is already server-oriented. Otherwise, keep the implementation in `apps/server/src/local-plugins.ts` and export only typed results through server code. The final choice should follow package dependency constraints during implementation.

## Phase 0: Baseline and Branch Protection

Deliverables:

- Confirm branch, working tree, and current remote state.
- Re-run baseline checks before touching implementation:
  - `pnpm typecheck`
  - `pnpm test`
  - `pnpm test:e2e`
- Record baseline results in `progress.md`.

Implementation notes:

- The current `develope` branch is ahead of `origin/develope` by the design commit. Do not rewrite or drop that commit.
- Existing Web-to-MCP behavior and P0 sample admin plugin behavior are regression-critical.

Exit criteria:

- Baseline checks pass or any existing failure is documented before implementation begins.
- Worktree state is understood and no unrelated changes are reverted.

## Phase 1: Configuration Surface

Deliverables:

- Add `pluginDir?: string` to `ServerConfig`.
- Read `MCPHUB_PLUGIN_DIR` in `loadConfig()`.
- Document the environment variable in README and `.env.example` if that file exists.

Implementation notes:

- Absence of `MCPHUB_PLUGIN_DIR` must preserve current startup behavior.
- Invalid or missing plugin directory should not crash the server. It should produce loader diagnostics and continue with built-in behavior.

Exit criteria:

- Config tests cover absent and present `MCPHUB_PLUGIN_DIR`.
- Server can still start with only the existing P0 sample admin configuration.

## Phase 2: Local Plugin Config Schema

Deliverables:

- Define `LocalPluginConfig` schema:
  - `enabled: boolean`
  - `config: Record<string, unknown>`
  - `credentials: Record<string, { type, secretRef, scope? }>`
  - `policy.dangerousMode?: "block" | "auditOnly" | "allow"`
- Define diagnostic types for skipped, disabled, invalid, and loaded plugins.
- Export typed loader result:
  - `manifests`
  - `policies`
  - `diagnostics`
  - optional repository seed records if useful

Implementation notes:

- Default `dangerousMode` is `auditOnly`.
- Config validation should reject unknown credential types using existing `credentialTypeSchema`.
- Disabled plugins should not expose tools.

Exit criteria:

- Unit tests cover valid config, missing config, invalid credential type, invalid dangerous mode, and disabled plugin config.

## Phase 3: Filesystem Loader

Deliverables:

- Scan `MCPHUB_PLUGIN_DIR` child directories.
- For each child directory:
  - read `plugin.config.json`
  - import `index.js` as ESM
  - validate default export with `pluginManifestSchema`
  - validate config against manifest credential requirements
  - skip invalid plugins with structured diagnostics
- Preserve deterministic ordering by plugin directory or manifest ID.

Implementation notes:

- Use `fs/promises`, `path`, and file URL dynamic imports.
- Avoid ad hoc string parsing for JSON. Use `JSON.parse` followed by Zod schema validation.
- A single broken plugin must not prevent other plugins from loading.
- Duplicate manifest IDs or duplicate tool names should be diagnosed and skipped or rejected consistently with `PluginRegistry`.

Exit criteria:

- Temp-directory tests cover:
  - one valid local plugin loads
  - broken `index.js` is skipped
  - missing `plugin.config.json` is skipped
  - invalid manifest is skipped
  - duplicate tool names are detected
  - disabled plugin does not appear in registry tools

## Phase 4: Repository Seeding for Local Plugins

Deliverables:

- For each enabled valid local plugin, write:
  - `plugins`
  - `plugin_tools`
  - `credentials`
- Use existing repository methods:
  - `upsertPlugin`
  - `upsertPluginTool`
  - `upsertCredential`
- Mark local plugin records with safe metadata if existing schemas allow it.

Implementation notes:

- Plugin `config` may include non-secret values such as `baseUrl`.
- Credential IDs should follow `${pluginId}.${requirementId}`.
- Secret references should be stored, but secret values must not be resolved during repository seeding.
- If manifest declares a credential requirement that config does not bind, skip the plugin with diagnostics.

Exit criteria:

- Repository tests or loader integration tests prove valid plugin metadata and credentials are written.
- `mcphub://plugins` shows local plugin metadata without raw secrets.

## Phase 5: Platform Service Composition

Deliverables:

- Update `createPlatformServices()` to compose:
  - built-in sample admin plugin when `SAMPLE_ADMIN_API_BASE_URL` is present
  - local plugin loader result when `MCPHUB_PLUGIN_DIR` is present
- Return a combined `PluginRegistry`.
- Return a policy map or policy config that the MCP gateway can apply per plugin/tool.
- Log or expose loader diagnostics without crashing startup.

Implementation notes:

- If neither built-in sample nor local plugins are configured, current behavior may continue returning `undefined`.
- If local plugins are configured but all are invalid, platform services should still expose diagnostics where feasible and server startup should continue.
- Duplicate IDs between built-in sample and local plugins need deterministic behavior. Recommended: local duplicate is skipped with diagnostics, built-in sample remains unchanged.

Exit criteria:

- Integration test proves sample admin plugin and a local plugin can both appear in `tools/list`.
- Integration test proves a bad local plugin does not remove the sample admin plugin.

## Phase 6: Dangerous Policy Modes

Deliverables:

- Extend policy model with:
  - `dangerousMode: "block" | "auditOnly" | "allow"`
  - per-plugin or per-tool policy lookup as needed
- Update `evaluateToolPolicy()` behavior:
  - `block`: return `CONFIRMATION_REQUIRED`
  - `auditOnly`: allow execution and mark policy mode for audit
  - `allow`: allow execution and mark policy mode for audit
- Preserve disabled plugin/tool and host/method/path denial precedence.

Implementation notes:

- `write` tools should follow the design: allow and audit by default in P1 unless an explicit existing restriction remains necessary. If changing P0 behavior would be too broad, limit the default write relaxation to local plugin policy entries and document it.
- The current P0 sample admin dangerous tool may stay blocked unless its policy is explicitly configured otherwise.
- Policy decisions may need to carry metadata, such as `dangerousMode`, so audit can record why execution was allowed.

Exit criteria:

- Policy tests cover:
  - disabled plugin deny
  - disabled tool deny
  - host/method/path deny
  - dangerous `block` deny
  - dangerous `auditOnly` allow
  - dangerous `allow` allow
  - read allow
  - write P1 behavior

## Phase 7: MCP Gateway and Audit Integration

Deliverables:

- Update platform tool calls to use the correct policy for the plugin/tool.
- Ensure dangerous `auditOnly` and `allow` execute connector requests.
- Ensure dangerous `block` does not execute connector requests.
- Include policy mode evidence in audit records without leaking secrets.
- Keep MCP tool listing and resource reading stable.

Implementation notes:

- Prefer adding structured policy metadata to audit summaries only if schema changes are small. Otherwise use redacted `inputSummary` metadata consistently.
- Avoid exposing `secretRef` values in public plugin resources if they are considered sensitive. At minimum, never expose resolved secret values.
- Continue returning MCP content in the same shape as current gateway responses.

Exit criteria:

- Gateway tests prove:
  - local read tool appears in `tools/list`
  - local read tool calls fixture REST endpoint
  - dangerous `block` returns `CONFIRMATION_REQUIRED`
  - dangerous `auditOnly` calls fixture endpoint
  - audit records include policy evidence
  - plugin resource output contains no raw token values

## Phase 8: Local Plugin Smoke Fixture

Deliverables:

- Add a test fixture local plugin directory for smoke validation, or generate one in a temp directory during smoke.
- The fixture plugin exposes:
  - one read tool
  - one dangerous tool
- Configure it through `plugin.config.json` and env-backed credentials.

Implementation notes:

- Prefer temp-dir generation in `scripts/smoke.ts` to avoid build artifacts committed as plugin fixtures.
- If committed fixture files are simpler, keep them under a clearly named test fixture directory and ensure they are precompiled JS.

Exit criteria:

- `pnpm test:e2e` validates local plugin discovery, `tools/list`, read execution, dangerous policy behavior, and audit evidence.

## Phase 9: Docker Validation

Deliverables:

- Update Docker/Compose documentation for mounting local plugin directories.
- Add or document a Docker smoke command that sets:
  - `MCPHUB_PLUGIN_DIR`
  - required plugin credential env vars
- Re-run Docker Compose validation.

Implementation notes:

- The runtime Docker image must contain enough workspace packages for local plugin imports such as `@mcphub/plugins`.
- If external plugin modules import `@mcphub/plugins`, the runtime module resolution path must work from the mounted plugin directory. If that is brittle, document the expected plugin build/bundle format.

Exit criteria:

- `docker compose config` passes.
- Docker server starts with a mounted local plugin directory.
- Docker MCP call can list and execute the local fixture plugin.

## Phase 10: Documentation and Operator Guide

Deliverables:

- README section for local plugin loading:
  - directory layout
  - plugin module example
  - `plugin.config.json` example
  - credential env setup
  - dangerous policy modes
  - validation commands
- Add an operator troubleshooting section:
  - plugin not listed
  - invalid manifest
  - missing env credential
  - module import failure
  - dangerous tool blocked unexpectedly

Implementation notes:

- Make clear that local plugins are trusted code.
- Make clear that P1 does not include runtime TypeScript compilation or sandboxing.

Exit criteria:

- A user can create a simple local plugin from the README and verify it with MCP `tools/list` and `tools/call`.

## Phase 11: Final Verification and Review

Deliverables:

- Run full local validation:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm build`
  - `pnpm test:e2e`
- Run Docker validation:
  - `docker compose config`
  - Docker local plugin smoke if available
- Review changed files for accidental secret exposure and unrelated churn.
- Update `task_plan.md`, `progress.md`, and `findings.md`.

Exit criteria:

- All required checks pass or failures are documented with root cause.
- Implementation is split into reviewable commits by functional area.
- User-facing summary explains:
  - what local plugins can do
  - how to verify them
  - dangerous policy behavior
  - remaining P2 work

## Acceptance Criteria

- When `MCPHUB_PLUGIN_DIR` is unset, current MCPHub behavior remains unchanged.
- A valid local plugin with `index.js` and `plugin.config.json` appears in `tools/list`.
- Local plugin metadata appears in `mcphub://plugins` without resolved secrets.
- A local read API tool calls a fixture REST endpoint and returns structured JSON.
- Dangerous local tools support:
  - `block`: connector is not called and MCP returns `CONFIRMATION_REQUIRED`
  - `auditOnly`: connector is called and audit records the policy mode
  - `allow`: connector is called and audit records the policy mode
- Broken plugins are skipped with diagnostics and do not prevent server startup.
- Existing Web MCP resources/tools still work.
- Existing sample admin plugin still works.
- Local tests, e2e smoke, and Docker validation pass.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Dynamic import path/module resolution fails for mounted plugins | Use file URL imports, test with temp dirs and Docker, document plugin bundling expectation |
| Local plugin imports cannot resolve `@mcphub/plugins` in Docker | Verify runtime dependencies and document whether plugins should bundle SDK helpers or rely on server workspace packages |
| Broken plugin crashes startup | Catch per-plugin errors and convert them to diagnostics |
| Secrets leak through plugin resources or audit | Redact resolved credentials, avoid exposing secret values, add assertions in tests |
| Dangerous policy weakens P0 safety unexpectedly | Apply explicit precedence and tests; keep `block` available and preserve sample behavior unless configured |
| Duplicate plugin/tool names produce nondeterministic behavior | Sort scan results and handle duplicates with deterministic diagnostics |

## Deferred Work

- Runtime TypeScript compilation.
- Remote plugin installation.
- Plugin sandboxing or permission isolation for untrusted code.
- Public plugin marketplace.
- OpenAPI/Postman import.
- Multi-instance plugin support.
- Admin UI for plugin, credential, policy, and confirmation management.
- Rich diagnostic MCP resources beyond the core plugin/audit resources.
