# Local Plugin Loading Design

Date: 2026-06-03
Parent design: `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`

## Goal

Add P1 local plugin loading so MCPHub can discover trusted, operator-provided API plugins from a filesystem directory instead of only using built-in plugins. This moves MCPHub closer to its intended role as a broad MCP middleware platform: users can write integration code for existing REST/admin systems, place the compiled plugin on the server, configure credentials and policy, and expose the result through the existing MCP endpoint.

This phase also changes dangerous-operation behavior from a fixed server-side block to a configurable policy. MCPHub should preserve safety metadata and audit evidence, but it should not assume it owns the final human approval flow. In many deployments, the MCP client or agent host already performs tool approval.

## Scope

P1 includes:

- Loading trusted local plugins from a configured filesystem directory.
- Requiring plugins to be precompiled JavaScript modules.
- Reading per-plugin instance configuration from `plugin.config.json`.
- Registering loaded plugins, tools, credential metadata, and policy in the existing runtime.
- Exposing loaded plugins through existing platform MCP resources and tools.
- Supporting configurable `dangerousMode` values: `block`, `auditOnly`, and `allow`.
- Extending tests and smoke validation to cover local plugin loading and dangerous policy behavior.

P1 does not include:

- Runtime TypeScript compilation.
- Remote plugin installation.
- Public plugin marketplace.
- Plugin sandboxing for malicious code.
- UI for plugin, credential, policy, or confirmation management.
- Multi-instance plugins with the same manifest ID.
- OpenAPI import.
- A full human confirmation UI for dangerous tools.

## Trust Model

Local plugins are trusted operator-provided code. Loading a plugin is equivalent to installing code on the MCPHub server. P1 should validate manifests and configuration to catch mistakes, but it does not try to safely run hostile plugins.

The server should still isolate failures at the plugin level. A broken local plugin should not prevent MCPHub from serving built-in Web MCP behavior or other valid plugins.

## Configuration

MCPHub reads the local plugin directory from:

```text
MCPHUB_PLUGIN_DIR=/opt/mcphub/plugins
```

If `MCPHUB_PLUGIN_DIR` is absent, MCPHub starts normally with built-in behavior and any explicitly configured built-in sample plugin support.

A local plugin directory contains one subdirectory per plugin:

```text
/opt/mcphub/plugins/
  admin-users/
    index.js
    plugin.config.json
  crm-contacts/
    index.js
    plugin.config.json
```

Each plugin directory must include:

- `index.js`: an ESM module with a default export containing a validated plugin manifest.
- `plugin.config.json`: the local instance configuration for this deployment.

P1 intentionally requires precompiled JavaScript. Users who write TypeScript plugins compile them before placing them in the plugin directory.

## Plugin Module Contract

A local plugin module exports a manifest created with the existing plugin SDK:

```js
import { defineApiTool, definePlugin } from "@mcphub/plugins";

export default definePlugin({
  id: "admin-users",
  name: "Admin Users",
  version: "0.1.0",
  type: "api",
  description: "Expose admin user APIs.",
  credentials: [{ id: "admin-token", type: "bearer" }],
  tools: [
    defineApiTool({
      name: "admin.users.list",
      description: "List users.",
      inputSchema: {
        type: "object",
        properties: { page: { type: "number" } }
      },
      effect: "read",
      method: "GET",
      path: "/api/users",
      credentialRefs: ["admin-token"]
    })
  ]
});
```

The loader validates the default export with the existing `pluginManifestSchema`. Manifests that fail validation are skipped and reported as loader diagnostics.

## Plugin Instance Configuration

`plugin.config.json` configures how this deployment runs the plugin:

```json
{
  "enabled": true,
  "config": {
    "baseUrl": "https://admin.example.com"
  },
  "credentials": {
    "admin-token": {
      "type": "bearer",
      "secretRef": "env:ADMIN_TOKEN"
    }
  },
  "policy": {
    "dangerousMode": "auditOnly"
  }
}
```

The schema is:

```ts
interface LocalPluginConfig {
  enabled: boolean;
  config: Record<string, unknown>;
  credentials: Record<
    string,
    {
      type: CredentialType;
      secretRef: string;
      scope?: string;
    }
  >;
  policy?: {
    dangerousMode?: "block" | "auditOnly" | "allow";
  };
}
```

Rules:

- `credentials` keys are manifest credential requirement IDs, such as `admin-token`.
- `secretRef` continues to support environment references such as `env:ADMIN_TOKEN`.
- `config.baseUrl` is used by API tools through the API Connector.
- Missing or invalid `plugin.config.json` means the plugin is skipped.
- If `enabled` is `false`, the plugin is recorded as disabled or skipped from runtime registration, but it must not expose tools.

## Loader Architecture

Add a local plugin loader module with this responsibility:

```text
MCPHUB_PLUGIN_DIR
  -> scan child directories
  -> read index.js and plugin.config.json
  -> validate manifest and config
  -> register metadata in repository
  -> build PluginRegistry and policy map
  -> return PlatformGatewayOptions
```

The server startup flow becomes:

```text
loadConfig()
  -> create repository
  -> migrate/seed repository if needed
  -> create extraction service
  -> create platform services
       -> built-in sample plugin if configured
       -> local plugin loader if MCPHUB_PLUGIN_DIR configured
  -> create Fastify app
  -> create SDK MCP server with platform options
```

The loader returns a structured result:

```ts
interface LocalPluginLoadResult {
  manifests: PluginManifest[];
  policies: Record<string, PluginPolicyConfig>;
  diagnostics: LocalPluginDiagnostic[];
}
```

The diagnostics are runtime data, not external instructions. They can be logged and later exposed through platform resources.

## Repository Writes

For each valid local plugin, MCPHub writes existing records:

`plugins`:

```ts
{
  id,
  name,
  version,
  type,
  description,
  enabled,
  config
}
```

`plugin_tools`:

```ts
{
  id,
  pluginId,
  name,
  description,
  inputSchema,
  effect,
  requiresConfirmation,
  credentialRefs,
  operation,
  enabled
}
```

`credentials`:

```ts
{
  id: `${pluginId}.${requirementId}`,
  pluginId,
  requirementId,
  name: requirementId,
  type,
  secretRef,
  scope
}
```

P1 does not add a `plugin_instances` table. One manifest ID maps to one configured local instance. Multi-instance support is deferred.

## Dangerous Policy

P1 replaces fixed dangerous blocking with configurable dangerous behavior.

Supported values:

```text
block
  Refuse dangerous tools before connector execution.
  Return CONFIRMATION_REQUIRED.
  Write blocked audit evidence.

auditOnly
  Allow dangerous tools to execute.
  Write audit evidence that the tool effect was dangerous and the policy mode was auditOnly.

allow
  Allow dangerous tools to execute.
  Write normal audit evidence with policy mode allow.
```

Default:

```text
dangerousMode = auditOnly
```

Rationale: MCPHub is middleware. In many deployments, the MCP client or agent host owns final approval for tool calls. MCPHub should preserve tool effect metadata and audit evidence without always duplicating client-side approval.

Policy precedence:

1. Disabled plugin: deny.
2. Disabled tool: deny.
3. Host/method/path restriction: deny.
4. Dangerous tool:
   - `block`: deny with `CONFIRMATION_REQUIRED`.
   - `auditOnly`: allow and audit.
   - `allow`: allow and audit.
5. Write tool:
   - P1 allows and audits by default.
   - Fine-grained write grants are deferred until policy management exists.
6. Read tool: allow when plugin and tool are enabled.

Audit records should include enough information to reconstruct policy behavior. P1 may include policy mode in `inputSummary` or a structured audit metadata field if one is added later.

## MCP Resources and Tool Listing

Existing resources remain stable:

```text
webmcp://sources
webmcp://sources/{sourceId}
webmcp://sources/{sourceId}/items
webmcp://items/{itemId}
webmcp://rules/{ruleId}/diagnostics
```

Platform resources remain:

```text
mcphub://plugins
mcphub://plugins/{pluginId}
mcphub://plugins/{pluginId}/tools
mcphub://audit/recent
```

`mcphub://plugins` should include local source metadata without exposing secrets:

```json
[
  {
    "id": "admin-users",
    "name": "Admin Users",
    "type": "api",
    "enabled": true,
    "source": "local",
    "config": {
      "baseUrl": "https://admin.example.com"
    },
    "credentials": [
      {
        "id": "admin-token",
        "type": "bearer",
        "configured": true
      }
    ]
  }
]
```

`mcphub://plugins/{pluginId}/tools` should include operation metadata:

```json
[
  {
    "name": "admin.users.list",
    "effect": "read",
    "enabled": true,
    "operation": {
      "type": "http",
      "method": "GET",
      "path": "/api/users"
    }
  }
]
```

`tools/list` should include tools from valid enabled local plugins. Duplicate tool names are rejected at registration time. If a local plugin collides with an already loaded built-in plugin, the local plugin is skipped and a diagnostic is recorded.

## Error Handling

MCPHub should favor server availability over plugin availability.

Plugin directory missing:

- Log a warning.
- Continue startup.
- No local plugins are loaded.

Plugin module import fails:

- Skip that plugin.
- Record diagnostic with path and error summary.
- Continue loading other plugins.

Manifest validation fails:

- Skip that plugin.
- Record Zod issue summary.

Config file missing or invalid:

- Skip that plugin.
- Record config diagnostic.

Credential environment variable missing:

- Keep plugin and tool registered.
- On tool call, return `CREDENTIAL_MISSING`.
- Write failed audit record.

Duplicate plugin ID:

- Keep the first loaded plugin.
- Skip later duplicate.
- Record diagnostic.

Duplicate tool name:

- Keep previously registered tool.
- Skip conflicting plugin.
- Record diagnostic.

Invalid `MCPHUB_PLUGIN_DIR` path:

- Treat it as a missing plugin directory.
- Continue startup.

## Testing Plan

Unit tests:

- Validate `localPluginConfigSchema` for valid config.
- Reject invalid `dangerousMode`.
- Reject missing `secretRef`.
- Reject invalid credential type.
- Loader returns empty result when directory is absent.
- Loader loads a valid plugin fixture.
- Loader skips missing config.
- Loader skips invalid manifest.
- Loader records duplicate tool diagnostics.

Policy tests:

- `dangerousMode=block` returns `CONFIRMATION_REQUIRED` and does not call connector.
- `dangerousMode=auditOnly` allows connector execution and writes audit evidence.
- `dangerousMode=allow` allows connector execution and writes audit evidence.
- Missing dangerous mode defaults to `auditOnly`.
- Disabled plugin and tool still deny before dangerous mode is considered.

Integration tests:

- Server `createPlatformServices` loads plugins from `MCPHUB_PLUGIN_DIR`.
- Repository receives plugin, tool, and credential metadata.
- `tools/list` includes local plugin tools through the official SDK transport.
- `mcphub://plugins` includes local plugin source information without secrets.
- `admin.users.list` calls a fixture API successfully.
- `admin.users.disable` executes under `auditOnly` and is blocked under `block`.
- `mcphub://audit/recent` contains the dangerous call evidence.

E2E smoke:

- Start fixture admin API.
- Create a temporary local plugin directory.
- Start MCPHub with `MCPHUB_PLUGIN_DIR`.
- Verify `tools/list` includes the local tool.
- Verify read tool succeeds.
- Verify dangerous tool behavior under `auditOnly`.
- Verify audit contains the dangerous call.
- Verify `block` config prevents remote dangerous execution.

Docker validation:

- Add a documented Compose volume example:

```yaml
volumes:
  - ./plugins-local:/opt/mcphub/plugins
environment:
  MCPHUB_PLUGIN_DIR: /opt/mcphub/plugins
```

- Validate server starts with mounted local plugins.
- Validate local plugin tools appear in MCP `tools/list`.
- Validate one read tool and audit resource through Docker.

## Acceptance Criteria

P1 is complete when:

- A user can place a precompiled JS plugin in `MCPHUB_PLUGIN_DIR` and have MCPHub load it at startup.
- Each plugin can provide `plugin.config.json` with `enabled`, `config`, `credentials`, and `policy`.
- Valid local plugin tools appear in MCP `tools/list`.
- Valid local plugin metadata appears in `mcphub://plugins` without secrets.
- API tools from local plugins can call fixture REST endpoints.
- Dangerous tools support `block`, `auditOnly`, and `allow`.
- Default dangerous behavior is `auditOnly`.
- Broken plugins are skipped without preventing MCPHub startup.
- Duplicate tool names are detected and reported.
- Audit records remain redacted and include dangerous-call evidence.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`, `pnpm test:e2e`, and Docker plugin smoke pass.

## Future Work

Deferred follow-up items:

- UI for plugin configuration and enable/disable controls.
- UI for credential binding and secret health checks.
- Policy management UI and fine-grained write grants.
- Human confirmation workflow for deployments that want server-owned confirmation.
- OpenAPI import assistant.
- Plugin health checks.
- Multi-instance plugin support.
- Plugin sandboxing and signing.
- Remote plugin registry or marketplace.
