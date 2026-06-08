# Plugin Executor Runtime Design

Date: 2026-06-03
Parent design: `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`

## Goal

Add a P2 custom executor runtime so MCPHub plugins can implement multi-step business workflows instead of only declaring one HTTP operation per tool.

The target use case is a plugin such as Bilibili video upload: one MCP tool call may need to validate input, resolve credentials, request upload parameters, upload file parts, submit metadata, poll status, and return a normalized result. MCPHub should provide the runtime boundary, credentials, policy, audit, and error handling. The plugin should own the site-specific workflow.

This keeps MCPHub as a broad middleware platform without hard-coding service-specific behavior into the core packages.

## Current Limitation

P1 local plugins support declarative HTTP tools:

```ts
operation: {
  type: "http",
  method: "GET",
  path: "/api/users"
}
```

That is a good fit for simple REST operations, but it is not enough for workflows that require:

- multiple API calls in sequence
- branching based on remote responses
- result cleaning and reshaping
- upload or multipart flows
- long-running polling
- business-level retries or compensating steps
- plugin-owned helper functions

## Scope

P2 includes:

- A backward-compatible executor tool definition alongside existing HTTP tools.
- Plugin module handlers that can be called by name.
- A typed `execute(input, context)` runtime contract.
- A controlled execution context for HTTP, credentials, config, audit, logging, and policy checkpoints.
- Step-level audit summaries for multi-step tools.
- Error normalization for plugin-thrown and runtime-thrown errors.
- Unit and smoke tests using a fake multi-step upload plugin.
- Documentation for users writing workflow plugins.

P2 does not include:

- A hardened sandbox for hostile plugins.
- Browser automation for websites with no API.
- A visual workflow editor.
- Public plugin marketplace review.
- Real Bilibili API integration in the repository.
- Durable background jobs or resumable uploads across server restarts.
- Per-user OAuth delegated auth.

## Design Direction

MCPHub should support two tool execution modes:

```ts
// Existing P1 mode.
operation: {
  type: "http";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
}

// New P2 mode.
executor: {
  type: "module";
  handler: string;
}
```

Existing declarative HTTP tools remain unchanged. Executor tools are used only when a plugin needs code-owned workflow behavior.

## Plugin Module Contract

A local plugin module can export a manifest plus named handlers.

Recommended shape:

```ts
export default definePlugin({
  id: "bilibili",
  name: "Bilibili",
  version: "0.2.0",
  type: "api",
  description: "Expose Bilibili workflows as MCP tools.",
  credentials: [{ id: "session-cookie", type: "cookie" }],
  tools: [
    {
      name: "bilibili.video.upload",
      description: "Upload a video through a multi-step workflow.",
      inputSchema: {
        type: "object",
        required: ["filePath", "title"],
        properties: {
          filePath: { type: "string" },
          title: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
          dryRun: { type: "boolean" }
        }
      },
      effect: "dangerous",
      credentialRefs: ["session-cookie"],
      executor: {
        type: "module",
        handler: "uploadVideo"
      }
    }
  ],
  handlers: {
    async uploadVideo(input, context) {
      await context.checkpoint("validate", { title: input.title });
      if (input.dryRun) {
        return { ok: true, dryRun: true };
      }

      const uploadSession = await context.http.post("/upload/session", { title: input.title });
      await context.checkpoint("upload-started", { uploadId: uploadSession.id });
      await context.http.uploadFileParts(uploadSession.uploadUrl, input.filePath);
      const submitted = await context.http.post("/upload/submit", { uploadId: uploadSession.id });
      return { ok: true, submissionId: submitted.id };
    }
  }
});
```

The exact TypeScript helper can evolve, but the runtime contract should stay simple: the manifest declares the handler name, and the module provides a function with that name.

## Executor Context

The runtime passes a controlled context to handlers:

```ts
interface PluginExecutorContext {
  pluginId: string;
  toolName: string;
  requestId: string;
  config: Record<string, unknown>;
  credentials: CredentialAccess;
  http: PluginHttpClient;
  checkpoint(step: string, summary?: Record<string, unknown>): Promise<void>;
  logger: PluginLogger;
}
```

### `context.config`

The plugin receives the deployment config from `plugin.config.json`, such as `baseUrl`, upload limits, default category IDs, or feature flags. Config values are non-secret.

### `context.credentials`

Plugins should not receive all raw secrets by default. They should request resolved credentials through a narrow API:

```ts
const cookie = await context.credentials.resolve("session-cookie");
```

Resolved values are available to trusted plugins, but audit summaries and MCP resources must never include raw secret values.

### `context.http`

The HTTP helper wraps the existing API Connector behavior where possible:

- base URL from plugin config
- headers and query construction
- credential injection
- timeout behavior
- response parsing
- redaction

It also adds executor-friendly helpers:

- `get(path, options)`
- `post(path, body, options)`
- `put(path, body, options)`
- `patch(path, body, options)`
- `delete(path, options)`
- `uploadFileParts(target, filePath, options)` for future upload-oriented plugins

The first implementation can keep upload helpers limited to test fixtures and simple file streaming. Full resumable upload support is deferred.

### `context.checkpoint`

Checkpoint records a redacted step-level audit event or appends step evidence to the tool call audit trail.

Examples:

```ts
await context.checkpoint("validated", { title, category });
await context.checkpoint("upload-session-created", { uploadId });
await context.checkpoint("submitted", { submissionId });
```

Checkpoints are important because one MCP tool call may perform many remote operations. Operators need a readable audit trail without secrets or huge payloads.

## Policy Model

Executor tools use the same `effect` values:

- `read`
- `write`
- `dangerous`

Policy is evaluated before the handler starts. For dangerous tools:

- `block` prevents handler execution.
- `auditOnly` allows handler execution and records policy mode.
- `allow` allows handler execution and records policy mode.

P2 also introduces optional handler-level preflight conventions:

- `dryRun: true` in input means the plugin should validate and summarize the plan without performing remote mutations, when the plugin supports it.
- `context.checkpoint()` records major steps.
- Future confirmation systems can use the preflight summary, but P2 does not implement a confirmation UI.

## Error Handling

Executor errors are normalized into platform error results:

- invalid input: `INVALID_TOOL_INPUT`
- missing credential binding: `CREDENTIAL_MISSING`
- invalid credential or rejected auth: `CREDENTIAL_INVALID`
- remote API failure: `REMOTE_HTTP_ERROR`
- timeout: `REMOTE_TIMEOUT`
- plugin-thrown workflow failure: `PLUGIN_EXECUTION_ERROR`

Handlers may throw a typed plugin error:

```ts
throw new PluginWorkflowError("PLUGIN_EXECUTION_ERROR", "Upload session was rejected.");
```

Unhandled errors are caught by MCPHub, redacted, audited as failed, and returned as `PLUGIN_EXECUTION_ERROR`.

## Runtime Authority

The current startup registry remains the execution authority. A persisted repository row is not enough to execute a plugin handler. The handler must be present in the loaded local plugin module for the current process.

This preserves the P1 fix: removing or disabling a local plugin must stop execution even if old metadata remains in the database.

## Audit Model

Executor audit should record:

- one `allowed` record after policy allows execution
- zero or more redacted checkpoint records or step summaries
- one final `succeeded` or `failed` record

If adding a new audit status or table is too broad, P2 can encode step summaries in a redacted structured field on audit records. The implementation plan should pick the smallest schema change that still makes multi-step calls understandable.

Audit must not store:

- raw tokens
- cookies
- authorization headers
- local file contents
- large video metadata blobs
- file paths if they reveal sensitive local structure, unless redacted

## Bilibili Upload Validation Use Case

The repository should not include a real Bilibili upload implementation. Instead, P2 should use a fake upload fixture that models the same shape:

```text
validate input
  -> create upload session
  -> upload part 1
  -> upload part 2
  -> submit metadata
  -> poll processing status
  -> return normalized result
```

Acceptance criteria:

- one MCP tool call can trigger multiple HTTP calls through the executor context
- credentials are resolved once and injected safely
- checkpoints appear in audit evidence
- dangerous policy `block` prevents the first remote call
- `auditOnly` allows the workflow and records policy mode
- plugin result is normalized by plugin code, not by MCPHub core

## Compatibility

Existing P1 local plugins remain valid. A plugin can mix both tool kinds:

- simple tools use `operation.type = "http"`
- complex tools use `executor.type = "module"`

MCPHub core should not know anything about Bilibili, GitHub, CRMs, or admin backends. It only knows the plugin contract and runtime context.

## Documentation Requirements

The README should explain:

- when to use declarative HTTP tools
- when to use executor tools
- how to write a handler
- what context APIs are available
- how credentials and config are accessed
- how audit checkpoints work
- why local executor plugins are trusted server-side code

## Open Decisions For Implementation Planning

The implementation plan should make concrete choices for:

- whether handlers live in the default export under `handlers` or as named module exports
- whether step-level audit needs a new table or can reuse existing audit records
- which upload helper subset is included in P2
- how much type information the plugin SDK exposes in the first executor release

