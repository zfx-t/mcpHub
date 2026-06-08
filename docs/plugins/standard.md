# MCPHub Plugin Standard

This document is the reference contract for local MCPHub plugins. The developer guide explains the tutorial path; this standard defines what a plugin should declare, how tools should be named, how compatibility is expressed, and how a plugin is verified before it is loaded for Agent use.

## Directory Layout

A local plugin lives in its own directory under `MCPHUB_PLUGIN_DIR`:

```text
plugins/
|-- my-plugin/
    |-- index.js
    |-- plugin.config.json
    |-- README.md
```

`index.js` exports the plugin manifest. `plugin.config.json` stores deployment-specific config, credential bindings, and policy. Secrets should be referenced through environment variables, not written into the plugin directory.

## Manifest Contract

The default export from `index.js` is a plain JavaScript object.

Required fields:

| Field | Rule |
|-------|------|
| `id` | Lowercase slug or dotted lowercase identifier. Keep it stable across versions. |
| `name` | Human-readable plugin name. |
| `version` | Semver-like plugin version, such as `0.1.0`. |
| `type` | `web_content`, `api`, or `custom`. |
| `description` | Short summary of the upstream service or workflow. |
| `tools` | Array of tool declarations. |

Recommended metadata:

| Field | Rule |
|-------|------|
| `homepage` | Upstream service or plugin documentation URL. |
| `author` | Maintainer name or organization. |
| `license` | SPDX-style license string when sharing the plugin. |
| `tags` | Lowercase tags for future discovery. |

Compatibility metadata:

```js
mcphub: {
  minVersion: "0.1.0",
  capabilities: ["http", "credentials", "policy"]
}
```

Supported capability names are:

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

Missing compatibility metadata is currently a warning. Unsupported required capabilities are errors.

## Config Contract

`plugin.config.json` controls the local deployment:

```json
{
  "enabled": true,
  "config": {
    "baseUrl": "http://127.0.0.1:4001"
  },
  "credentials": {
    "api-token": {
      "type": "bearer",
      "secretRef": "env:API_TOKEN"
    }
  },
  "policy": {
    "dangerousMode": "auditOnly"
  }
}
```

Credential binding keys must match `credentials[].id` in the manifest. `dangerousMode` can be `block`, `auditOnly`, or `allow`.

## Tool Naming

Use this shape:

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
- Use at least three segments.
- Keep names stable after documentation.
- Prefer nouns for the resource segment.
- Use verbs for the action segment.
- Do not expose raw HTTP paths as tool names.

## Tool Execution Models

Each tool must declare exactly one execution model.

Use `operation` for one HTTP request:

```js
{
  name: "admin.users.list",
  description: "List backend users.",
  inputSchema: { type: "object", properties: { page: { type: "number" } } },
  effect: "read",
  credentialRefs: ["admin-token"],
  operation: { type: "http", method: "GET", path: "/api/users" }
}
```

Use `executor` for custom code, multiple API calls, dry-run logic, checkpoints, upload flows, result cleanup, or workflow orchestration:

```js
{
  name: "media.videos.upload",
  description: "Upload and publish a video.",
  inputSchema: { type: "object", required: ["title"], properties: { title: { type: "string" } } },
  effect: "dangerous",
  credentialRefs: ["upload-token"],
  executor: { type: "module", handler: "uploadVideo" }
}
```

The referenced handler must exist in `handlers` and must be a function.

## Effects

| Effect | Meaning |
|--------|---------|
| `read` | Reads upstream data and should not change upstream state. |
| `write` | Creates or updates upstream state but is generally reversible or low risk. |
| `dangerous` | Deletes, disables, publishes, bills, sends, uploads, or triggers hard-to-reverse changes. |

Choose conservatively. When unsure, use the stronger effect.

## Input And Output

Tool input schemas should be JSON Schema objects:

```js
inputSchema: {
  type: "object",
  required: ["id"],
  properties: {
    id: { type: "string" },
    reason: { type: "string" }
  }
}
```

Do not pass secrets as normal tool arguments when environment-backed credentials can be used.

Recommended successful output shape:

```json
{
  "ok": true,
  "data": {},
  "summary": "Short human-readable summary"
}
```

Executor tools that perform write or dangerous actions should support `dryRun` when practical.

## Resource URI Naming

MCPHub platform resources use `mcphub://`:

```text
mcphub://status
mcphub://plugins
mcphub://plugins/<plugin-id>
mcphub://audit/recent
```

Future plugin-owned resources should use:

```text
mcphub-plugin://<plugin-id>/<resource>/<id>
```

This avoids collisions between platform resources and plugin resources.

## Standard Error Codes

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

Diagnostics must not include secrets, full local filesystem paths, full upstream response bodies, or raw credential values.

## Verification Checklist

Run:

```bash
pnpm plugin:verify examples/plugins/fake-upload
```

The verifier checks:

- required files exist
- manifest schema is valid
- standard metadata is compatible
- tool names follow the standard
- each tool has one execution model
- input schemas are top-level objects
- credentials are bound in `plugin.config.json`
- executor handlers exist

Warnings do not block local development. Errors fail verification.

## Runtime Diagnostics

Operators can inspect:

```bash
curl http://127.0.0.1:3000/api/plugins
pnpm mcp:client --url http://127.0.0.1:3000/mcp read-resource --uri mcphub://status
```

Plugin summaries include standard compatibility state, warning counts, error counts, and tool execution modes.

## Migration Expectations

The first standard version keeps compatibility metadata optional. Future MCPHub releases may make selected metadata stricter after migration guidance exists. Existing plugins should add `mcphub.minVersion` and `mcphub.capabilities` early so operators can understand compatibility before runtime.
