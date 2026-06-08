# MCPHub Platform Design

Date: 2026-06-02

## Goal

Upgrade MCPHub from a Web-content-to-MCP service into a general MCP adaptation platform. The platform should let users expose websites, admin systems, REST APIs, OpenAPI-described services, and custom integration code as MCP Resources and Tools without modifying the original systems.

The immediate product direction is a layered platform:

1. Keep the existing Web content adapter as a built-in plugin.
2. Add an API-first plugin runtime for REST/OpenAPI/admin-service integrations.
3. Defer browser automation and public plugin marketplace workflows until the security model is mature.

## Confirmed Direction

- MCPHub is a broad middleware platform for services that do not natively support MCP.
- P0 focuses on REST/API/custom-code plugins because this directly supports admin backend use cases.
- Existing Web extraction remains useful and should be refactored into a built-in Web content plugin instead of discarded.
- Users should be able to write plugin code that maps existing backend API operations to MCP tools.
- The original website or backend service should not need to be changed.
- Security, credentials, policy, and audit are first-class platform concerns, not afterthoughts.

## Non-Goals for P0

- Browser automation for sites with no API.
- Public plugin marketplace and review workflow.
- Multi-tenant SaaS billing or organization management.
- Visual plugin builder.
- Automatic full OpenAPI import with perfect operation naming.
- Executing dangerous backend mutations without explicit policy controls.
- Running untrusted third-party plugin code in a fully hardened sandbox.

## Architecture

The platform has eight major modules.

### MCP Gateway

The MCP Gateway remains the single MCP endpoint exposed to agents. It aggregates resources and tools registered by enabled plugins.

Responsibilities:

- expose Streamable HTTP MCP endpoint
- list plugin-provided Resources
- list plugin-provided Tools
- route `resources/read` and `tools/call` to the owning plugin
- normalize tool errors into MCP-compatible structured responses
- attach request IDs and audit correlation IDs

### Plugin Registry

The Plugin Registry stores plugin metadata and enabled plugin instances.

It tracks:

- plugin ID
- plugin name and description
- plugin type: `web_content`, `api`, `custom`
- version
- enabled/disabled state
- instance configuration
- required credential references
- declared resources
- declared tools
- declared policy metadata

The registry should support built-in plugins and local custom plugins. Public remote plugin distribution is deferred.

### Plugin Runtime

The Plugin Runtime loads plugins and exposes a narrow host API.

P0 plugin runtime responsibilities:

- load built-in plugin modules
- load local workspace plugin modules
- validate plugin manifests
- allow plugins to register MCP resources and tools
- provide access to API Connector, Credential Store, and Audit Logger through host APIs
- prevent plugins from directly reading raw credential values unless explicitly required by the connector

P0 does not claim to securely sandbox malicious plugin code. It treats plugins as trusted operator-provided code.

### API Connector

The API Connector executes outbound HTTP requests for API plugins.

Responsibilities:

- construct URL from `baseUrl`, path params, query params, and operation path
- attach auth headers from credential references
- serialize JSON request bodies
- enforce timeouts
- normalize HTTP errors
- redact secrets from logs
- return structured response data to tools

Supported P0 authentication modes:

- static bearer token
- API key in header
- API key in query string
- basic auth
- static cookie header
- environment variable reference

OAuth refresh, browser login reuse, and per-user delegated auth are deferred.

### Credential Store

The Credential Store separates secrets from plugin code and plugin manifests.

Credential records contain:

- credential ID
- display name
- type
- encrypted or environment-backed secret value
- target host or plugin scope
- created and updated timestamps

In P0, local/self-host deployments may use environment variables and database-backed encrypted storage. Public hosted mode requires stronger isolation before untrusted tenants are supported.

### Policy Engine

The Policy Engine decides whether a tool call is allowed.

Every tool declares an effect:

- `read`: safe read-only operation
- `write`: mutation that changes remote state
- `dangerous`: destructive, irreversible, high-risk, or permission-changing operation

P0 policy behavior:

- `read` tools can run when the plugin is enabled.
- `write` tools require an enabled policy grant.
- `dangerous` tools require an explicit confirmation token or operator-side approval mechanism.
- tools can be disabled individually.
- tools can restrict allowed hosts, HTTP methods, and path patterns.

Examples of dangerous operations:

- deleting users or content
- disabling accounts
- modifying roles or permissions
- refunding payments
- publishing public content
- bulk updates
- changing system configuration

### Audit Log

The Audit Log records all MCP tool calls that reach plugin execution.

Audit records include:

- audit ID
- request ID
- plugin ID
- tool name
- caller/client info when available
- effect classification
- target service and operation
- redacted input summary
- status: `allowed`, `blocked`, `succeeded`, `failed`
- HTTP status code when applicable
- duration
- error code and message
- timestamp

Audit logs should never store raw secrets.

### Built-In Web Content Plugin

The current Web-to-MCP MVP becomes a built-in plugin.

It owns:

- source detection
- source search
- source refresh
- extraction preview
- debug explain
- `webmcp://sources`
- `webmcp://sources/{sourceId}`
- `webmcp://sources/{sourceId}/items`
- `webmcp://items/{itemId}`
- `webmcp://rules/{ruleId}/diagnostics`

This keeps existing functionality while allowing the platform to grow beyond content extraction.

## Plugin Model

### Plugin Manifest

A plugin manifest declares the plugin's identity, configuration needs, resources, tools, credentials, and policy metadata.

Example:

```ts
export default definePlugin({
  id: "admin-users",
  name: "Admin User Management",
  version: "0.1.0",
  type: "api",
  description: "Expose existing admin user REST APIs as MCP tools.",
  configSchema: {
    baseUrl: { type: "string", format: "uri" }
  },
  credentials: [
    {
      id: "admin-api-token",
      type: "bearer",
      description: "Token used to call the admin API."
    }
  ],
  tools: [
    defineApiTool({
      name: "admin.users.list",
      description: "List backend users.",
      effect: "read",
      method: "GET",
      path: "/api/users",
      inputSchema: {
        type: "object",
        properties: {
          page: { type: "number" },
          query: { type: "string" }
        }
      }
    }),
    defineApiTool({
      name: "admin.users.disable",
      description: "Disable a backend user.",
      effect: "dangerous",
      requiresConfirmation: true,
      method: "POST",
      path: "/api/users/{id}/disable",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: {
          id: { type: "string" },
          reason: { type: "string" }
        }
      }
    })
  ]
});
```

### Tool Naming

Tool names should be stable, namespaced, and operation-oriented.

Recommended pattern:

```text
{domain}.{resource}.{action}
```

Examples:

- `admin.users.list`
- `admin.users.disable`
- `crm.contacts.search`
- `cms.posts.publish`
- `billing.invoices.read`

### Tool Output

Plugin tools return structured JSON content, not raw HTTP responses.

Tool result shape:

```json
{
  "ok": true,
  "operation": "admin.users.list",
  "data": {},
  "metadata": {
    "statusCode": 200,
    "durationMs": 120,
    "source": "admin-api"
  }
}
```

Errors return:

```json
{
  "ok": false,
  "error": {
    "code": "REMOTE_HTTP_ERROR",
    "message": "Admin API returned HTTP 403.",
    "retryable": false
  },
  "metadata": {
    "statusCode": 403
  }
}
```

## API-to-MCP Mapping

REST operations map to MCP Tools.

Mapping rules:

- `GET` operations usually become `read` tools.
- `POST`, `PUT`, `PATCH`, and `DELETE` operations usually become `write` or `dangerous` tools.
- path params, query params, and JSON body fields become tool input schema fields.
- response JSON becomes tool output content.
- binary/file operations are deferred unless a plugin explicitly handles them.

OpenAPI import can assist tool generation, but P0 should allow manual plugin code first because backend APIs often require domain-specific naming, policy labels, and response cleanup.

## Resources vs Tools

Resources expose relatively stable readable context.

Examples:

- `mcphub://plugins`
- `mcphub://plugins/{pluginId}`
- `mcphub://plugins/{pluginId}/tools`
- `mcphub://audit/recent`
- built-in Web content resources such as `webmcp://sources`

Tools execute parameterized operations.

Examples:

- `plugin.search`
- `plugin.enable`
- `admin.users.list`
- `admin.users.disable`
- `crm.contacts.search`
- `source.refresh`

P0 should avoid tool sprawl by only registering enabled plugin tools.

## Workflows

### Plugin Installation Workflow

1. Operator places plugin code in a configured local plugin directory or enables a built-in plugin.
2. MCPHub loads plugin manifest.
3. MCPHub validates plugin ID, tool names, schemas, credential requirements, and policies.
4. Operator provides plugin configuration and credential references.
5. Plugin becomes enabled.
6. MCP Gateway lists the plugin's resources and tools.

### Agent Tool Call Workflow

1. Agent calls an MCP tool.
2. MCP Gateway resolves the owning plugin.
3. Policy Engine evaluates the tool effect and grants.
4. Credential Store resolves credential references.
5. API Connector executes the remote call when needed.
6. Plugin formats the result.
7. Audit Log records the outcome.
8. MCP Gateway returns the result to the agent.

### Dangerous Operation Workflow

1. Agent calls a dangerous tool.
2. Policy Engine blocks execution unless a valid confirmation is present.
3. MCPHub returns a structured confirmation-required response.
4. Operator or client obtains confirmation through an approved UI or configured flow.
5. Agent retries with confirmation token.
6. MCPHub executes the operation and records audit evidence.

P0 may implement the policy model and return confirmation-required errors before a full UI exists.

## Data Model Additions

### Plugin

Fields:

- `id`
- `name`
- `version`
- `type`
- `description`
- `enabled`
- `config`
- `createdAt`
- `updatedAt`

### PluginTool

Fields:

- `id`
- `pluginId`
- `name`
- `description`
- `inputSchema`
- `effect`
- `requiresConfirmation`
- `enabled`

### Credential

Fields:

- `id`
- `pluginId`
- `name`
- `type`
- `secretRef`
- `scope`
- `createdAt`
- `updatedAt`

### AuditRecord

Fields:

- `id`
- `requestId`
- `pluginId`
- `toolName`
- `effect`
- `status`
- `target`
- `inputSummary`
- `statusCode`
- `durationMs`
- `errorCode`
- `errorMessage`
- `timestamp`

## Error Handling

Platform-level error codes:

- `PLUGIN_NOT_FOUND`
- `PLUGIN_DISABLED`
- `TOOL_NOT_FOUND`
- `TOOL_DISABLED`
- `INVALID_TOOL_INPUT`
- `POLICY_DENIED`
- `CONFIRMATION_REQUIRED`
- `CREDENTIAL_MISSING`
- `CREDENTIAL_INVALID`
- `REMOTE_HTTP_ERROR`
- `REMOTE_TIMEOUT`
- `PLUGIN_EXECUTION_ERROR`
- `AUDIT_WRITE_FAILED`

Errors should include:

- machine-readable code
- human-readable message
- retryability
- plugin ID when available
- tool name when available
- request ID
- audit ID when available

## P0 Scope

P0 includes:

1. Plugin registry data model.
2. Built-in Web content plugin wrapper for existing capabilities.
3. Local trusted plugin loading.
4. API plugin SDK for manually mapping REST operations to MCP tools.
5. API Connector for JSON HTTP APIs.
6. Credential references through environment variables and database records.
7. Tool policy metadata: `read`, `write`, `dangerous`.
8. Blocking behavior for dangerous tools without confirmation.
9. Audit log for all plugin tool calls.
10. MCP Gateway aggregation across built-in and API plugins.
11. One sample admin API plugin.

## P1 Scope

P1 includes:

- OpenAPI import assistant.
- plugin configuration UI.
- credential management UI.
- policy management UI.
- confirmation flow UI.
- plugin health checks.
- richer audit search.

## P2 Scope

P2 includes:

- browser automation adapter for sites with no API.
- public plugin marketplace.
- plugin signing and review.
- multi-tenant hosted mode.
- per-user delegated auth.

## Migration From Current MVP

The current MVP remains valuable. It should migrate as follows:

- `packages/mcp` becomes the aggregation layer over plugin-provided resources and tools.
- existing source extraction services become `web-content-plugin`.
- existing Source/Rule/Document/FeedItem models remain under the Web content plugin domain.
- platform-level Plugin/Tool/Credential/Audit models are added alongside existing models.
- `/api/detect-site` continues to serve browser extension detection for Web content support.
- `/mcp` remains the main MCP endpoint but lists tools from all enabled plugins.

## Acceptance Criteria

- An operator can enable the built-in Web content plugin and retain current MCP resource/tool behavior.
- An operator can add a local API plugin that exposes at least two REST endpoints as MCP tools.
- A read-only REST operation can be called by an MCP client and returns structured JSON content.
- A dangerous operation is blocked without confirmation and writes an audit record.
- A plugin can reference credentials without hardcoding secrets in plugin source code.
- The MCP Gateway can list tools from both the Web content plugin and the API plugin.
- Audit logs record successful, failed, blocked, and policy-denied tool calls.

## Testing Strategy

- Unit tests for plugin manifest validation.
- Unit tests for API Connector request construction and secret redaction.
- Unit tests for Policy Engine effect handling.
- Unit tests for Credential Store resolution.
- Integration tests for plugin tool registration through MCP.
- Integration tests for an API plugin calling a fixture HTTP server.
- Integration tests for dangerous tool blocking and audit logging.
- Regression tests proving existing Web content MCP resources and tools still work.
- Docker smoke test covering server startup with built-in Web plugin and sample API plugin.

## Open Questions For Later Phases

- What confirmation UX should be used for dangerous operations?
- Should P1 include a browser-based admin UI or only config files first?
- Should OpenAPI import generate editable plugin code, database records, or both?
- What sandboxing model is required before third-party marketplace plugins are allowed?
- Which MCP clients should be used for manual compatibility smoke tests?
