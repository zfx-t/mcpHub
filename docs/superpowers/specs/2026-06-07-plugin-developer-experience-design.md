# Plugin Developer Experience Design

Date: 2026-06-07
Parent designs:
- `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`
- `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md`

## Goal

Make it straightforward for a developer to create, edit, and locally validate an MCPHub plugin without first reverse-engineering the existing examples.

The runtime already supports local plugin loading and executor handlers. The next bottleneck is developer workflow: users still need to manually create the plugin directory, write `index.js`, write `plugin.config.json`, remember the credential/config/policy shape, and determine whether MCPHub can load the result.

This phase adds a parameter-based CLI workflow and focused documentation so the common path becomes:

```bash
pnpm plugin:create my-admin --template http-api --base-url http://127.0.0.1:4001 --tool-name admin.users.list
pnpm plugin:verify examples/plugins/my-admin
```

## Scope

This phase includes:

- A parameter-only plugin creation CLI.
- Two first-party templates:
  - `http-api`
  - `executor`
- A local plugin verification CLI.
- Developer documentation for creating, editing, configuring, loading, and troubleshooting plugins.
- Package scripts that expose the workflow through `pnpm`.
- Tests for CLI behavior and template validity.

This phase does not include:

- Interactive prompts.
- A plugin marketplace.
- Plugin packaging or publishing.
- TypeScript plugin compilation.
- Real Bilibili or real third-party API workflow generation.
- OpenAPI import.
- Browser automation.
- Running a full remote API fixture for arbitrary user plugins.

Generated plugin code is intended to be edited by the user. The CLI should produce a correct starting point, not infer complete business logic.

## Target User

The target user is a developer or operator who knows the backend or website API they want to expose to AI through MCPHub.

They should be able to:

1. Generate a plugin skeleton.
2. Edit the generated tool schema and handler or HTTP path.
3. Bind environment-based credentials in `plugin.config.json`.
4. Verify that MCPHub can load the plugin.
5. Start MCPHub with `MCPHUB_PLUGIN_DIR` and inspect MCP tools.

## Recommended Approach

Use option C: `plugin:create` + `plugin:verify` + developer documentation.

### Why This Approach

Only adding docs would leave users copying examples manually. Only adding a create command would make the first step easier but would not help users diagnose broken manifests, missing handlers, or invalid config. A create command plus a verify command gives a minimal loop:

```text
create -> edit -> verify -> run MCPHub
```

This keeps the implementation small while addressing the main friction in the current project.

## CLI Commands

### `plugin:create`

Package script:

```bash
pnpm plugin:create <plugin-name> --template <http-api|executor> [options]
```

Expected implementation entrypoint:

```text
scripts/plugin-create.ts
```

Required arguments:

| Argument | Description |
|----------|-------------|
| `<plugin-name>` | Directory and default plugin id. Must be a lowercase slug. |
| `--template` | Either `http-api` or `executor`. |

Optional arguments:

| Option | Default | Description |
|--------|---------|-------------|
| `--out <dir>` | `examples/plugins` | Parent directory where the plugin directory is created. |
| `--base-url <url>` | `http://127.0.0.1:4001` | Value written to `plugin.config.json` as `config.baseUrl`. |
| `--tool-name <name>` | Generated from plugin name | MCP tool name, such as `admin.users.list`. |
| `--credential-id <id>` | `api-token` | Credential requirement id. |
| `--credential-type <type>` | `bearer` | One of the credential types already supported by MCPHub. |
| `--secret-env <name>` | Uppercase plugin slug plus `_TOKEN` | Environment variable referenced by `secretRef`. |
| `--force` | false | Allow overwriting an existing generated plugin directory. |

The CLI should fail with a clear message when:

- plugin name is missing
- template is missing or unknown
- plugin name is not a safe slug
- output path exists and `--force` is not set
- `--base-url` is not a URL
- `--tool-name` is not a safe MCP tool name

### `plugin:verify`

Package script:

```bash
pnpm plugin:verify <plugin-dir>
```

Expected implementation entrypoint:

```text
scripts/plugin-verify.ts
```

The verification command should validate the local plugin without requiring a real remote API.

Checks:

1. Plugin directory exists.
2. `index.js` exists.
3. `plugin.config.json` exists and parses as JSON.
4. The local plugin loader can load the plugin from its parent directory.
5. Manifest schema is valid.
6. Config schema is valid.
7. Credential bindings match manifest requirements.
8. Executor tools reference loaded function handlers.
9. Disabled plugins report as disabled rather than broken.

The command should print a concise result:

```text
Plugin verification passed
Plugin: my-admin
Tools:
- admin.users.list (read, http)
```

For failures, it should print loader diagnostics with actionable messages. It should exit non-zero when the target plugin is missing, invalid, or broken.

The verifier should not call remote APIs. End-to-end workflow execution remains covered by `pnpm test:plugin` and purpose-built fixture tests.

## Templates

Templates may be implemented as inline builders in the CLI or as files under:

```text
examples/plugin-templates/
  http-api/
  executor/
```

The file-based template directory is preferred if the implementation stays simple, because users can inspect the template source directly.

### HTTP API Template

Generated structure:

```text
<plugin-name>/
  index.js
  plugin.config.json
  README.md
```

Generated `index.js` should export a plain manifest object, not require TypeScript compilation.

The tool should use:

```js
operation: { type: "http", method: "GET", path: "/api/example" }
```

The user can later edit method, path, input schema, credential refs, and effect.

### Executor Template

Generated structure:

```text
<plugin-name>/
  index.js
  plugin.config.json
  README.md
```

Generated `index.js` should include:

- one executor tool
- `executor: { type: "module", handler: "runWorkflow" }`
- `handlers.runWorkflow`
- `dryRun` branch
- at least two `context.checkpoint()` calls
- one example `context.http.get()` or `context.http.post()`

The generated workflow should be intentionally generic. It should demonstrate the shape of the code without pretending to implement a real third-party service.

## Documentation

Add a focused plugin developer guide:

```text
docs/plugins/development.md
```

The guide should cover:

- Quick start with `plugin:create`.
- Template selection: when to use `http-api` vs `executor`.
- Generated directory structure.
- `index.js` manifest anatomy.
- `plugin.config.json` anatomy.
- Credential binding through environment variables.
- Tool effects: `read`, `write`, `dangerous`.
- Local loading with `MCPHUB_PLUGIN_DIR`.
- Static verification with `plugin:verify`.
- End-to-end demo with `pnpm test:plugin`.
- Common errors and fixes.

README should link to this guide instead of absorbing all detail.

## Data Flow

Create flow:

```text
CLI args
  -> parse and validate
  -> choose template
  -> derive defaults
  -> create plugin directory
  -> write index.js, plugin.config.json, README.md
  -> print next commands
```

Verify flow:

```text
plugin dir
  -> resolve parent plugin root
  -> call local plugin loader for parent root
  -> select target plugin by directory name
  -> print loaded plugin/tools or diagnostics
  -> exit 0 or non-zero
```

The verifier should reuse existing local loader behavior instead of reimplementing manifest validation. This keeps CLI validation aligned with server startup validation.

## Error Handling

CLI errors should be short and actionable:

- `Unknown template "foo". Use http-api or executor.`
- `Plugin directory already exists. Re-run with --force to overwrite.`
- `Invalid tool name. Use dot-separated lowercase identifiers, such as admin.users.list.`
- `Plugin failed verification: executor handler runWorkflow is missing.`

The commands should avoid stack traces for expected user errors. Unexpected internal errors may still show stack traces during development, but tests should cover normal failure paths.

## Testing

Tests should cover:

- `plugin:create` creates an HTTP API plugin.
- `plugin:create` creates an executor plugin.
- generated plugins pass `plugin:verify`.
- existing directory without `--force` fails.
- unknown template fails.
- invalid plugin name fails.
- verifier fails for missing directory.
- verifier fails for missing executor handler.

At least one test should prove the generated executor plugin can be loaded by the same local loader used by MCPHub runtime.

Manual validation:

```bash
pnpm plugin:create my-admin --template http-api --tool-name admin.users.list
pnpm plugin:verify examples/plugins/my-admin
pnpm plugin:create my-workflow --template executor --tool-name workflow.run
pnpm plugin:verify examples/plugins/my-workflow
pnpm lint
pnpm typecheck
pnpm test
```

## Acceptance Criteria

- A user can generate an HTTP plugin using one command.
- A user can generate an executor plugin using one command.
- Generated plugins are plain JavaScript and do not require a separate build step.
- Generated plugins include `plugin.config.json` with config, credentials, and policy.
- `plugin:verify` validates generated plugins without starting the MCPHub HTTP server.
- `plugin:verify` reports actionable diagnostics for invalid plugins.
- README points users to the plugin development guide.
- The plugin development guide explains the full create-edit-verify-run workflow.
- Existing `pnpm test:plugin` continues to work as the end-to-end executor demo.

## Open Decisions

No open product decisions remain for this phase. The user selected parameter-style CLI only; interactive prompts are explicitly out of scope.
