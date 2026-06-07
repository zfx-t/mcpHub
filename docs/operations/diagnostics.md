# Diagnostics

MCPHub exposes diagnostics for operators and agents. These surfaces are intentionally curated and do not expose raw environment variables or secret values.

## HTTP Status

```bash
curl http://localhost:3000/api/status
```

The status response includes:

- service name and version
- repository mode: `memory` or `postgres`
- database configured and health flags
- plugin directory configured flag
- loaded, disabled, and diagnostic plugin counts
- MCP resource URIs
- MCP tool names
- plugin tool execution modes
- audit availability

Use this endpoint when the server is running but an MCP client cannot see the expected tools.

## Plugin Diagnostics

```bash
curl http://localhost:3000/api/plugins
```

The response includes loaded plugin summaries and local loader diagnostics.

Common diagnostic codes:

| Code | Meaning |
|------|---------|
| `plugin_dir_missing` | `MCPHUB_PLUGIN_DIR` is set but unavailable or not a directory. |
| `missing_entrypoint` | A plugin directory does not contain `index.js`. |
| `missing_config` | A plugin directory does not contain `plugin.config.json`. |
| `config_parse_error` | `plugin.config.json` is not valid JSON. |
| `config_validation_error` | `plugin.config.json` does not match MCPHub's local plugin config schema. |
| `manifest_import_error` | MCPHub could not import the plugin module. |
| `manifest_validation_error` | The default export is not a valid plugin manifest. |
| `credential_binding_missing` | A manifest credential requirement is not bound in config. |
| `credential_binding_type_mismatch` | Configured credential type differs from the manifest requirement. |
| `executor_handler_missing` | An executor tool references a missing handler. |
| `duplicate_plugin_id` | The plugin ID is already loaded. |
| `duplicate_tool_name` | A tool name is already loaded. |
| `disabled_plugin` | The plugin is explicitly disabled in `plugin.config.json`. |
| `loaded_plugin` | A local plugin loaded successfully. |

## MCP Status

Agents can read the same operational summary through MCP:

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"mcphub://status"}}'
```

`resources/list` should include:

- `mcphub://status`
- `webmcp://sources`
- `mcphub://plugins` when platform plugins are configured
- `mcphub://audit/recent` when platform plugins are configured

## Common Failures

**Port already used**

Change the port:

```bash
PORT=3001 pnpm dev
MCPHUB_BASE_URL=http://127.0.0.1:3001 pnpm dev:smoke
```

**PostgreSQL unavailable**

Start PostgreSQL and wait for health:

```bash
docker compose up -d postgres
docker compose ps
```

**Plugin directory missing**

Check the configured path:

```bash
echo "$MCPHUB_PLUGIN_DIR"
ls "$MCPHUB_PLUGIN_DIR"
```

**Plugin disabled**

Set `enabled` to `true` in `plugin.config.json`.

**Invalid plugin config**

Run:

```bash
pnpm plugin:verify path/to/plugin
```

Then inspect `/api/plugins` for the exact diagnostic.

**Missing credential environment variable**

If `plugin.config.json` contains:

```json
{
  "credentials": {
    "admin-token": {
      "type": "bearer",
      "secretRef": "env:ADMIN_TOKEN"
    }
  }
}
```

Start the server with:

```bash
ADMIN_TOKEN=replace-me MCPHUB_PLUGIN_DIR=path/to/plugins pnpm dev
```

MCPHub records configured credential bindings, but actual secret resolution happens at tool execution time.
