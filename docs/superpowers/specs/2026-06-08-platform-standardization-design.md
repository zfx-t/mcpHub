# MCPHub Platform Standardization Design

Date: 2026-06-08
Parent designs:
- `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`
- `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`
- `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md`
- `docs/superpowers/specs/2026-06-07-plugin-developer-experience-design.md`
- `docs/superpowers/specs/2026-06-08-generic-mcp-client-design.md`

## Goal

Turn MCPHub's existing plugin runtime into a clearer platform standard.

The project already proves that plugins can expose HTTP API tools, executor workflow tools, credentials, policy effects, audit events, diagnostics, and Agent-facing MCP resources/tools. The next bottleneck is repeatability: a developer should be able to read a standard, implement a plugin, run verification, and understand whether the plugin is compatible with the current MCPHub version.

This phase defines and begins enforcing the first MCPHub plugin contract:

```text
plugin manifest -> standardized tools/resources/errors -> local verification -> platform diagnostics -> Agent-visible MCP surface
```

The goal is similar to the role route conventions play in RSSHub. MCPHub should not depend on every plugin author reading internal runtime code. The standard should explain what a plugin is allowed to declare, how names should be shaped, what compatibility means, how errors are reported, and how a plugin is accepted as ready for local use.

## Current Baseline

MCPHub currently includes:

- `@mcphub/core` schemas for plugin manifests and tools.
- `@mcphub/plugins` SDK helpers, local loader, registry, sample plugin, and verifier path.
- HTTP operation tools and module executor tools.
- Local plugin configuration through `plugin.config.json`.
- Environment-backed credentials.
- Policy effects: `read`, `write`, and `dangerous`.
- Dangerous mode controls: `block`, `auditOnly`, and `allow`.
- Audit logger and checkpoint audit records.
- HTTP `/api/plugins`, `/api/status`, and MCP `mcphub://status`.
- `pnpm plugin:create`, `pnpm plugin:verify`, `pnpm test:plugin`, and `pnpm mcp:client`.

The current gap is not runtime capability. The gap is that the platform contract is spread across schemas, examples, CLI behavior, tests, and README snippets. This makes the project harder to scale as an RSSHub-like middleware where many developers can contribute adapters independently.

## Scope

This phase includes:

- A written MCPHub plugin standard document.
- Manifest metadata rules for identity, version, compatibility, capabilities, tools, credentials, and config.
- Tool and resource naming conventions.
- Standard guidance for input/output schemas and effect classification.
- Standard error code guidance for plugin loading, credential resolution, policy blocking, execution, and response normalization.
- A compatibility model for current and future MCPHub versions.
- Enhancements to local verification so common standard violations are reported before runtime.
- Diagnostics alignment so `/api/plugins` and MCP status resources expose standardized compatibility and validation signals.
- Developer documentation updates that tell plugin authors how to satisfy the standard.
- Tests for standard validation and verifier output.

This phase does not include:

- A remote plugin marketplace.
- Plugin publishing, packaging, signing, or trust review.
- OpenAPI import.
- Browser automation adapters.
- Multi-tenant permission management.
- Full production authentication for the MCP endpoint.
- Rewriting existing runtime boundaries.
- Breaking existing valid sample plugins without a migration path.

## Recommended Approach

Use an incremental standardization approach:

1. Define the standard in documentation.
2. Encode the most important rules in shared validation helpers.
3. Make `plugin:verify` run those validations.
4. Surface validation and compatibility state in platform diagnostics.
5. Keep existing plugin runtime behavior compatible unless a rule protects correctness or safety.

This is better than designing a large marketplace-grade standard immediately. The current project needs a usable dev platform first. The standard should be strict enough to prevent unclear plugin behavior, but small enough that developers can still write plugins by hand.

## Standard Document

Add a first-party standard guide:

```text
docs/plugins/standard.md
```

The guide should be the canonical human-facing contract for MCPHub plugin authors.

Recommended sections:

- Plugin directory layout.
- `index.js` export contract.
- `plugin.config.json` contract.
- Manifest identity fields.
- Compatibility fields.
- Capability fields.
- Tool declaration rules.
- HTTP operation tool rules.
- Executor tool rules.
- Credential requirement and binding rules.
- Config value rules.
- Tool effect classification.
- Tool/resource naming conventions.
- Error code and result shape guidance.
- Local verification checklist.
- Runtime diagnostics checklist.
- Migration guidance for future MCPHub versions.

`docs/plugins/development.md` should remain the tutorial. `docs/plugins/standard.md` should be the reference.

## Manifest Standard

The plugin manifest should continue to be a plain JavaScript object exported from `index.js`, but the standard should make the expected fields explicit.

Required identity fields:

| Field | Rule |
|-------|------|
| `id` | Lowercase slug with dots or hyphens. Stable across versions. |
| `name` | Human-readable plugin name. |
| `version` | Semver plugin version. |
| `description` | Short summary of the external system or capability. |

Recommended metadata fields:

| Field | Rule |
|-------|------|
| `homepage` | Link to upstream service or plugin docs. |
| `author` | Person or organization maintaining the plugin. |
| `license` | SPDX-style license string when the plugin is intended to be shared. |
| `tags` | Short lowercase tags for future listing and discovery. |

Compatibility fields:

| Field | Rule |
|-------|------|
| `mcphub.minVersion` | Minimum MCPHub version expected by the plugin. |
| `mcphub.maxVersion` | Optional upper bound if the plugin depends on unstable behavior. |
| `mcphub.capabilities` | List of required platform capabilities such as `http`, `executor`, `credentials`, `audit`, or `checkpoint`. |

The first implementation can support compatibility fields as optional metadata with warnings. Future releases can make them stricter once migration tooling exists.

## Tool Standard

Every tool should have a stable name and a clear effect.

Tool name format:

```text
<domain>.<resource>.<action>
```

Examples:

```text
admin.users.list
admin.users.disable
bilibili.videos.upload
github.issues.create
```

Rules:

- Use lowercase dot-separated names.
- Keep names stable once documented.
- Prefer nouns for the resource segment.
- Use verbs for the action segment.
- Avoid plugin-specific prefixes that duplicate the plugin id unless needed to prevent ambiguity.
- Do not expose raw HTTP paths as tool names.

Each tool must declare exactly one execution model:

| Model | Use when |
|-------|----------|
| `operation.type = "http"` | A single HTTP API request maps cleanly to one MCP tool. |
| `executor.type = "module"` | The tool needs custom code, multiple requests, checkpoints, result cleanup, dry-run behavior, or workflow logic. |

Effect classification:

| Effect | Meaning |
|--------|---------|
| `read` | Reads data and should not change upstream state. |
| `write` | Creates or updates upstream state but is generally reversible or low risk. |
| `dangerous` | Deletes, disables, publishes, bills, sends, uploads, or triggers hard-to-reverse state changes. |

The standard should require conservative classification. When unsure, plugin authors should choose the stronger effect.

## Input And Output Standard

Tool input schemas should be JSON Schema objects.

Rules:

- Top-level input schema must be an object.
- Required fields should be explicit.
- Descriptions should explain business meaning, not internal implementation.
- Secret values should not be accepted as normal tool arguments when environment credentials can be used.
- `dryRun` should be supported for executor tools that perform write or dangerous actions when practical.

Tool output should be JSON-serializable and concise.

Recommended output shape:

```json
{
  "ok": true,
  "data": {},
  "summary": "Short human-readable summary"
}
```

Error output should use the platform error envelope rather than arbitrary exception strings.

## Resource Standard

Platform-owned resources keep the `mcphub://` scheme.

Recommended resource URI shape:

```text
mcphub://status
mcphub://plugins
mcphub://plugins/<plugin-id>
mcphub://audit/recent
```

Plugin-owned resources should use a namespaced URI:

```text
mcphub-plugin://<plugin-id>/<resource>/<id>
```

This phase may document plugin-owned resources before fully exposing custom resource registration. The naming rule still matters because future plugin resources should not collide with platform resources.

## Error Standard

MCPHub should expose errors using stable platform codes. The standard should document which codes plugin authors and platform maintainers should expect.

Recommended categories:

| Code | Meaning |
|------|---------|
| `PLUGIN_LOAD_ERROR` | Plugin entrypoint/config could not be read or imported. |
| `PLUGIN_MANIFEST_INVALID` | Manifest failed schema or standard validation. |
| `PLUGIN_COMPATIBILITY_WARNING` | Plugin may not match the current MCPHub version or capability set. |
| `PLUGIN_COMPATIBILITY_ERROR` | Plugin requires unsupported platform capabilities. |
| `CREDENTIAL_MISSING` | Required credential binding or environment value is missing. |
| `POLICY_BLOCKED` | Tool call was blocked by policy. |
| `CONFIRMATION_REQUIRED` | Dangerous tool requires external confirmation under current policy. |
| `PLUGIN_EXECUTION_ERROR` | Plugin handler or HTTP operation failed. |
| `UPSTREAM_HTTP_ERROR` | External API returned a non-success response. |
| `PLUGIN_RESPONSE_INVALID` | Plugin returned a result that cannot be normalized. |

Diagnostics may include:

- `pluginId`
- `toolName`
- `severity`
- `code`
- `message`
- `path`
- `suggestion`

Diagnostics must not include secrets, full local filesystem paths, full upstream response bodies, or raw credential values.

## Compatibility Model

MCPHub should publish a small platform capability set for the current process.

Initial capability names:

```text
http
executor
credentials
policy
audit
checkpoint
local-loader
plugin-config
```

The loader or verifier can compare plugin-declared `mcphub.capabilities` against this set.

Compatibility behavior:

| Situation | Behavior |
|-----------|----------|
| No compatibility metadata | Load if old schema is valid; emit recommendation warning in verifier. |
| Unsupported required capability | Fail verification and do not load as ready. |
| `minVersion` above current version | Fail verification. |
| `maxVersion` below current version | Warn by default; future strict mode can fail. |
| Unknown metadata field | Warn only if it looks like a misspelled standard field. |

This keeps older local plugins usable while guiding new plugins toward explicit compatibility.

## Verification Enhancements

`pnpm plugin:verify <plugin-dir>` should become the main local standard gate.

New checks:

- Manifest has standard identity fields.
- `version` is semver-like.
- Tool names follow dot-separated format.
- Tool effects are present and valid.
- Each tool has exactly one execution model.
- HTTP tools include method and path.
- Executor tools reference available handlers.
- Top-level input schemas are objects.
- Credential requirements have matching config bindings.
- Compatibility capability requirements are supported.
- Diagnostics are grouped by severity.

Verifier output should remain concise:

```text
Plugin verification passed
Plugin: my-admin
Standard: compatible
Warnings: 1
Tools:
- admin.users.list (read, http)
```

Warnings should not block local development. Errors should exit non-zero.

## Platform Diagnostics

`/api/plugins` should expose standard-aligned metadata without leaking sensitive details.

Recommended plugin summary fields:

```json
{
  "id": "sample-admin",
  "name": "Sample Admin",
  "version": "0.1.0",
  "standard": {
    "compatible": true,
    "warnings": 0,
    "errors": 0
  },
  "tools": [
    {
      "name": "admin.users.list",
      "effect": "read",
      "execution": "http"
    }
  ]
}
```

`mcphub://status` should continue to summarize platform health. It can include counts for compatible plugins, plugins with warnings, and plugins with errors. Detailed diagnostics should stay in `/api/plugins` or a dedicated plugin resource to avoid bloating status.

## Data Flow

Verification flow:

```text
plugin dir
  -> load plugin config
  -> import manifest
  -> schema validation
  -> standard validation
  -> compatibility validation
  -> print grouped diagnostics
```

Runtime diagnostic flow:

```text
plugin root
  -> local loader
  -> schema validation
  -> standard validation
  -> registry
  -> gateway diagnostics
  -> /api/plugins and MCP status summary
```

Tool call flow is unchanged:

```text
MCP tools/call
  -> registry lookup
  -> policy check
  -> credential/config resolution
  -> HTTP operation or executor handler
  -> audit record
  -> normalized result/error
```

## Testing Strategy

Unit tests:

- Standard validation accepts current sample plugins.
- Standard validation warns on missing recommended compatibility metadata.
- Standard validation rejects invalid tool names.
- Standard validation rejects tools with both `operation` and `executor`.
- Standard validation rejects non-object top-level input schemas.
- Compatibility validation rejects unsupported required capabilities.
- Verifier output includes standard warning/error counts.

Integration tests:

- `plugin:verify` passes for generated `http-api` and `executor` templates.
- `plugin:verify` reports actionable errors for an invalid plugin fixture.
- `/api/plugins` includes standard compatibility summary.
- `mcphub://status` includes standard plugin counts.

Final verification:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:plugin
pnpm build
git diff --check
```

## Acceptance Criteria

This phase is complete when:

- `docs/plugins/standard.md` exists and documents the MCPHub plugin standard.
- The standard covers manifest metadata, tools, resources, effects, errors, compatibility, verification, and diagnostics.
- Shared validation logic enforces the highest-value standard rules.
- `pnpm plugin:verify` reports standard compatibility, warnings, and errors.
- Existing sample/generated plugins remain usable or receive clear migration guidance.
- Platform diagnostics expose standard compatibility state without leaking secrets or full local paths.
- Tests cover standard validation and diagnostics behavior.
