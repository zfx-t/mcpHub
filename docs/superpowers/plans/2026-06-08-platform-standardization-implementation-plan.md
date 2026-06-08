# MCPHub Platform Standardization Implementation Plan

Date: 2026-06-08
Design: `docs/superpowers/specs/2026-06-08-platform-standardization-design.md`

## Goal

Implement the first MCPHub plugin platform standard so developers can write, verify, and diagnose plugins against a documented contract instead of reverse-engineering runtime code.

The completed work should deliver:

- `docs/plugins/standard.md` as the reference standard.
- Shared standard validation logic.
- `pnpm plugin:verify` reporting compatibility, warnings, and errors.
- Platform diagnostics exposing standard compatibility state.
- Tests proving sample and generated plugins satisfy the standard.

This plan does not implement a plugin marketplace, plugin signing, OpenAPI import, browser automation, multi-tenant permissions, production MCP authentication, or a runtime rewrite.

## Working Assumptions

- Keep standard validation in the existing plugin/core boundary unless implementation reveals a cleaner local pattern.
- Existing sample and generated plugins should remain usable.
- Missing new compatibility metadata should initially be a warning, not a runtime blocker.
- Unsupported required capabilities should fail verification and surface as diagnostics.
- `docs/plugins/development.md` remains the tutorial; `docs/plugins/standard.md` becomes the reference.
- Runtime tool execution flow should stay unchanged unless diagnostics need additional metadata.
- Implementation starts only after this plan is reviewed and approved.

## Target Code Shape

Expected file areas:

```text
docs/plugins/
|-- development.md
|-- standard.md

packages/core/src/
|-- schemas.ts
|-- types.ts
|-- plugin-standard.ts      # possible shared standard validation helpers
|-- core.test.ts

packages/plugins/src/
|-- local-loader.ts
|-- local-loader.test.ts
|-- registry.ts
|-- sample-admin-plugin.ts

scripts/plugin-dev/
|-- verify.ts

scripts/
|-- plugin-cli.test.ts

packages/mcp/src/
|-- gateway.ts
|-- gateway.test.ts

apps/server/src/
|-- app.test.ts
```

The exact helper location can change if the current package boundaries make a different placement cleaner. The standard validation logic must be testable without starting the server.

## Phase 0: Baseline And Worktree Protection

Tasks:

- Confirm branch and worktree state.
- Read:
  - `docs/superpowers/specs/2026-06-08-platform-standardization-design.md`
  - current plugin schemas
  - local loader
  - verifier implementation
  - platform diagnostics code
- Run or record baseline checks:
  - `pnpm typecheck`
  - focused plugin verifier tests if useful

Exit criteria:

- Work starts from a known branch state.
- Any existing failure is recorded before implementation edits.
- No unrelated user changes are included in implementation commits.

## Phase 1: Standard Reference Documentation

Tasks:

- Add `docs/plugins/standard.md`.
- Cover:
  - plugin directory layout
  - `index.js` export contract
  - `plugin.config.json` contract
  - manifest identity fields
  - optional metadata fields
  - `mcphub.minVersion`, `mcphub.maxVersion`, and `mcphub.capabilities`
  - HTTP operation tool rules
  - executor tool rules
  - credential binding rules
  - config value rules
  - tool effect classification
  - tool naming rules
  - resource URI naming rules
  - input/output recommendations
  - standard error codes
  - local verification checklist
  - runtime diagnostics checklist
  - migration expectations
- Update `docs/plugins/development.md` to link to the reference standard.
- Update README and `README_cn.md` only with short links if they do not already point clearly to plugin docs.

Exit criteria:

- A plugin author can read the standard without opening runtime source.
- The standard is consistent with current local plugin and executor behavior.

## Phase 2: Core Standard Types And Validation Helper

Tasks:

- Add or extend shared types for:
  - diagnostic severity: `info`, `warning`, `error`
  - standard diagnostic code
  - standard validation result
  - plugin compatibility metadata
  - platform capability names
- Extend plugin manifest schema to accept optional standard metadata:
  - `homepage`
  - `author`
  - `license`
  - `tags`
  - `mcphub.minVersion`
  - `mcphub.maxVersion`
  - `mcphub.capabilities`
- Implement pure validation helpers for:
  - plugin id format
  - semver-like plugin version
  - tool name format
  - exactly one execution model
  - top-level input schema object
  - effect presence and validity
  - HTTP operation method/path presence
  - unsupported required capabilities
  - missing recommended compatibility metadata warning

Implementation notes:

- Keep warnings distinct from errors.
- Avoid adding heavy semver dependencies unless existing dependencies already include one.
- Validation should not read files, import plugins, call network, or require server startup.

Exit criteria:

- Standard validation can be unit tested with plain manifest objects.
- Current sample plugin manifests either pass or receive only intended warnings.

## Phase 3: Local Loader Diagnostics Integration

Tasks:

- Make local plugin loading run standard validation after schema validation.
- Attach standard diagnostics to loaded plugin metadata.
- Preserve current behavior for compatibility warnings.
- Treat standard errors as invalid plugin diagnostics.
- Ensure disabled plugins still do not import entrypoints and do not produce misleading standard failures.
- Ensure diagnostics continue to redact full local paths and secret-related data.

Implementation notes:

- Loader diagnostics should use the standard diagnostic shape where practical.
- Keep old diagnostic fields if existing tests or docs depend on them, but map them into standard fields for new surfaces.

Exit criteria:

- Invalid standard fixtures are reported as plugin diagnostics.
- Valid old plugins are not broken by missing optional metadata.

## Phase 4: `plugin:verify` Standard Gate

Tasks:

- Update `scripts/plugin-dev/verify.ts` so `pnpm plugin:verify <plugin-dir>` reports:
  - plugin id/name/version
  - standard compatibility status
  - warning count
  - error count
  - tool list with effect and execution model
  - grouped diagnostics with code, path, message, and suggestion when available
- Exit non-zero when standard errors exist.
- Keep warnings non-blocking.
- Keep output concise for passing plugins.
- Ensure generated `http-api` and `executor` templates pass verification.

Example passing output:

```text
Plugin verification passed
Plugin: my-admin
Standard: compatible
Warnings: 1
Tools:
- admin.users.list (read, http)
```

Exit criteria:

- `plugin:verify` becomes the user-facing local standard gate.
- Failure output tells developers what to change next.

## Phase 5: Platform Diagnostics Alignment

Tasks:

- Extend plugin summaries returned by `/api/plugins` with standard compatibility data:
  - compatible boolean
  - warning count
  - error count
  - selected diagnostics
  - tool execution model
- Extend `mcphub://status` summary with aggregate standard counts:
  - compatible plugin count
  - plugins with warnings
  - plugins with errors
- Keep detailed diagnostics out of the high-level status resource unless already compact.
- Ensure no full local filesystem paths, secrets, or upstream response bodies are exposed.

Implementation notes:

- Prefer typed gateway diagnostics over stringifying and reparsing MCP resources.
- Keep `/api/status` small and operator-focused.

Exit criteria:

- Operators can see whether loaded plugins satisfy the standard.
- Agent-visible status can summarize plugin standard health.

## Phase 6: Plugin Templates And Sample Plugin Alignment

Tasks:

- Update sample plugin metadata to satisfy the new standard where appropriate.
- Update `plugin:create` templates to include recommended standard metadata:
  - `version`
  - `description`
  - `mcphub.minVersion`
  - `mcphub.capabilities`
- Ensure generated tool names follow the documented naming rules.
- Ensure generated README files mention `docs/plugins/standard.md`.

Exit criteria:

- Newly generated plugins pass `plugin:verify`.
- Existing example plugins remain clear references for the standard.

## Phase 7: Automated Tests

Tasks:

- Add or update unit tests for standard validation:
  - valid sample manifest
  - missing compatibility metadata warning
  - invalid tool name error
  - both `operation` and `executor` error
  - missing execution model error
  - non-object input schema error
  - unsupported capability error
- Update local loader tests for standard diagnostics.
- Update plugin CLI tests for verifier output and exit codes.
- Update gateway/app tests for `/api/plugins` and `mcphub://status` standard summaries.

Exit criteria:

- `pnpm test` covers standard validation, verifier output, and diagnostics surfaces.
- Tests prove warnings are non-blocking and errors are blocking.

## Phase 8: Documentation Review And Final Verification

Tasks:

- Review docs for contradictions between `standard.md`, `development.md`, README, and code behavior.
- Run:
  - `pnpm typecheck`
  - `pnpm lint`
  - `pnpm test`
  - `pnpm test:e2e`
  - `pnpm test:plugin`
  - `pnpm build`
  - `git diff --check`
- Manually verify, if a local server is running or can be started:
  - `pnpm plugin:verify examples/plugins/fake-upload`
  - `pnpm mcp:client --url http://127.0.0.1:3000/mcp read-resource --uri mcphub://status`
  - `curl http://127.0.0.1:3000/api/plugins`

Exit criteria:

- All required checks pass.
- Manual verification commands are documented in the final response.
- Worktree contains only intended implementation changes.

## Phase 9: Commit Strategy

Preferred split:

- Commit 1: standard documentation and planning files.
- Commit 2: core standard validation and tests.
- Commit 3: verifier and loader diagnostics.
- Commit 4: platform diagnostics and docs/template alignment.

If the actual diff is smaller, combine adjacent commits while preserving reviewability.

Exit criteria:

- Commits are grouped by function.
- Final response reports commit ids and verification results.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Standard becomes too strict and breaks existing plugins | Treat compatibility metadata as warnings first; only enforce correctness and safety rules. |
| Validation duplicates existing schema checks | Keep schema validation for structure and standard validation for platform contract guidance. |
| Diagnostics expose sensitive local or upstream details | Reuse existing path compression and redaction rules; add tests for public diagnostics shape. |
| New metadata creates future migration burden | Keep fields optional and documented; enforce required behavior only when it protects correctness. |
| Verifier output becomes noisy | Group diagnostics by severity and keep passing output concise. |

## Acceptance Checklist

- [ ] `docs/plugins/standard.md` exists and is linked from developer docs.
- [ ] Plugin manifest schema accepts standard metadata.
- [ ] Shared standard validation reports warnings and errors.
- [ ] `pnpm plugin:verify` reports standard compatibility state.
- [ ] Existing sample/generated plugins pass or show only intentional warnings.
- [ ] `/api/plugins` exposes standard compatibility summaries.
- [ ] `mcphub://status` exposes aggregate standard plugin counts.
- [ ] Tests cover validation, verifier behavior, and diagnostics surfaces.
- [ ] Final verification commands pass.
