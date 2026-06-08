# Plugin Development Guide

本文档说明如何创建、编辑、验证并加载本地 MCPHub 插件。生成的插件是可编辑的 plain JavaScript ESM 代码，不需要单独编译。

本地插件是 trusted server-side JavaScript。MCPHub 会验证 manifest 和 config 形状，并跳过损坏插件，但不会把插件代码当作不可信代码沙箱执行。

插件的参考契约、命名规则、兼容性 metadata 和 verifier 期望见 [MCPHub Plugin Standard](./standard.md)。

## Quick Start

创建一个 HTTP API 插件：

```bash
pnpm plugin:create my-admin --template http-api --base-url http://127.0.0.1:4001 --tool-name admin.users.list
pnpm plugin:verify examples/plugins/my-admin
```

创建一个 executor workflow 插件：

```bash
pnpm plugin:create my-workflow --template executor --tool-name workflow.jobs.run
pnpm plugin:verify examples/plugins/my-workflow
```

启动 MCPHub 并加载插件：

```bash
MCPHUB_PLUGIN_DIR=examples/plugins pnpm dev
```

然后通过 MCP `tools/list` 检查工具是否被注册。

## 选择模板

使用 `http-api` 模板，当一个 MCP tool 只需要映射到一次 REST 请求，例如 `GET /api/users` 或 `POST /api/users/{id}/disable`。

使用 `executor` 模板，当一次 MCP call 需要插件自有代码，例如输入校验、多次 API 调用、上传步骤、轮询状态、结果整理，或需要 `dryRun` 预览。

## HTTP API 插件

创建命令：

```bash
pnpm plugin:create my-admin --template http-api \
  --base-url http://127.0.0.1:4001 \
  --tool-name admin.users.list \
  --credential-id api-token \
  --credential-type bearer \
  --secret-env ADMIN_TOKEN
```

生成的 `index.js` 会包含一个 declarative HTTP tool，大致形状如下：

```js
export default {
  id: "my-admin",
  name: "my-admin",
  version: "0.1.0",
  type: "api",
  description: "Expose my-admin APIs as MCP tools.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["http", "credentials", "policy", "plugin-config"]
  },
  credentials: [{ id: "api-token", type: "bearer" }],
  tools: [
    {
      name: "admin.users.list",
      description: "Example read tool.",
      inputSchema: { type: "object", properties: {} },
      effect: "read",
      credentialRefs: ["api-token"],
      operation: { type: "http", method: "GET", path: "/api/example" }
    }
  ]
};
```

你通常需要编辑：

- `operation.method` 和 `operation.path`
- `inputSchema`
- `description`
- `effect`
- `credentialRefs`

## Executor Workflow 插件

创建命令：

```bash
pnpm plugin:create my-workflow --template executor \
  --base-url http://127.0.0.1:4001 \
  --tool-name workflow.jobs.run
```

生成的 `index.js` 会包含一个 executor tool 和对应 handler：

```js
export default {
  id: "my-workflow",
  name: "my-workflow",
  version: "0.1.0",
  type: "custom",
  description: "Expose my-workflow workflows as MCP tools.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["executor", "credentials", "policy", "audit", "checkpoint", "plugin-config"]
  },
  tools: [
    {
      name: "workflow.jobs.run",
      description: "Run an example workflow.",
      inputSchema: {
        type: "object",
        properties: { dryRun: { type: "boolean" } }
      },
      effect: "write",
      executor: { type: "module", handler: "runWorkflow" }
    }
  ],
  handlers: {
    async runWorkflow(input, context) {
      await context.checkpoint("validated", { dryRun: Boolean(input.dryRun) });
      if (input.dryRun) return { ok: true, dryRun: true };

      const result = await context.http.get("/api/example");
      await context.checkpoint("remote-called", { ok: true });
      return { ok: true, result };
    }
  }
};
```

Handler 可用的主要能力：

- `context.config`: 来自 `plugin.config.json` 的非 secret 配置
- `context.credentials.resolve(id)`: 解析 manifest 声明的 credential binding
- `context.http.get/post/put/patch/delete`: 使用 `config.baseUrl` 的 JSON HTTP helper
- `context.checkpoint(step, summary)`: 写入已脱敏的 audit checkpoint
- `context.logger`: server-side plugin 日志

`dryRun` 只是模板约定。MCPHub 不会强制 executor handler 遵守 dry-run 语义，实际分支由插件代码负责。

## 生成文件结构

默认输出目录是 `examples/plugins`。每个子目录是一个插件：

```text
examples/plugins/
  my-admin/
    index.js
    plugin.config.json
    README.md
```

可用 `--out <dir>` 修改父目录：

```bash
pnpm plugin:create my-admin --template http-api --out /tmp/mcphub-plugins
```

如果目标插件目录已存在，命令默认失败。确认要覆盖生成目录时再使用：

```bash
pnpm plugin:create my-admin --template http-api --force
```

## `index.js` Manifest Anatomy

`index.js` 必须 default-export 一个 plugin manifest：

```js
export default {
  id: "my-admin",
  name: "My Admin",
  version: "0.1.0",
  type: "api",
  description: "Expose admin APIs.",
  configSchema: {
    type: "object",
    required: ["baseUrl"],
    properties: {
      baseUrl: { type: "string", format: "uri" }
    }
  },
  credentials: [{ id: "api-token", type: "bearer" }],
  tools: []
};
```

常用字段：

- `id`: 插件标识，建议和目录名一致
- `version`: 插件版本
- `type`: 常见为 `api` 或 `custom`
- `configSchema`: `plugin.config.json` 中 `config` 的 JSON Schema
- `credentials`: 插件需要的 credential metadata，不包含 secret
- `tools`: 暴露给 MCP 的工具列表
- `handlers`: executor plugin 的 handler 函数字典

每个 tool 必须选择一种执行模式：

- `operation`: 由 MCPHub declarative HTTP connector 执行
- `executor`: 调用本地插件 handler 执行

不要在同一个 tool 中同时声明 `operation` 和 `executor`。

## `plugin.config.json`

`plugin.config.json` 保存部署相关配置、credential 绑定和 policy：

```json
{
  "enabled": true,
  "config": {
    "baseUrl": "https://admin.example.com"
  },
  "credentials": {
    "api-token": {
      "type": "bearer",
      "secretRef": "env:ADMIN_TOKEN"
    }
  },
  "policy": {
    "dangerousMode": "auditOnly"
  }
}
```

字段说明：

- `enabled`: `false` 时插件会被识别为 disabled，不会注册 tools
- `config`: 非 secret 配置，需匹配 `configSchema`
- `credentials`: 把 manifest 中的 credential id 绑定到实际 secret 来源
- `policy.dangerousMode`: 控制 `effect: "dangerous"` 工具的执行策略

## Credential Env 绑定

生成模板默认使用环境变量绑定：

```json
{
  "credentials": {
    "api-token": {
      "type": "bearer",
      "secretRef": "env:ADMIN_TOKEN"
    }
  }
}
```

启动 MCPHub 前设置对应环境变量：

```bash
ADMIN_TOKEN=replace-me MCPHUB_PLUGIN_DIR=examples/plugins pnpm dev
```

注意：

- `credentials` key 必须匹配 `index.js` 中声明的 credential `id`
- `type` 必须匹配 manifest 中的 credential `type`
- `secretRef` 指向的环境变量必须存在于 MCPHub server 进程环境中
- secret 不应写进 `index.js` 或提交到仓库

## Tool Effect

每个 tool 需要声明 `effect`：

- `read`: 只读取远端状态，例如 list/get/search
- `write`: 会创建或修改状态，但通常是业务内可接受的普通写操作
- `dangerous`: 高风险操作，例如删除、禁用账号、提交发布、付款、不可逆动作

`dangerous` tool 受 `plugin.config.json` 中 `policy.dangerousMode` 控制：

- `block`: 返回 `CONFIRMATION_REQUIRED`，不调用远端 API
- `auditOnly`: 调用远端 API，并记录 dangerous audit evidence
- `allow`: 调用远端 API，并记录普通 audit evidence

模板默认更保守：HTTP 示例通常是 `read`，executor 示例通常是 `write`。只有在调用语义确实高风险时才改成 `dangerous`。

## 验证插件

静态验证一个插件目录：

```bash
pnpm plugin:verify examples/plugins/my-admin
```

验证命令会检查：

- 插件目录存在
- `index.js` 存在
- `plugin.config.json` 存在且 JSON 可解析
- local plugin loader 能从父目录加载目标插件
- manifest 和 config schema 有效
- credential bindings 与 manifest requirements 匹配
- executor tool 引用的 handler 存在
- disabled plugin 会明确报告为 disabled

成功输出类似：

```text
Plugin verification passed
Plugin: my-admin
Standard: compatible
Warnings: 0
Errors: 0
Tools:
- admin.users.list (read, http)
```

`plugin:verify` 不会调用远端 API，也不需要启动 MCPHub HTTP server。

## 使用 `MCPHUB_PLUGIN_DIR` 加载插件

`MCPHUB_PLUGIN_DIR` 指向插件父目录，而不是单个插件目录：

```bash
MCPHUB_PLUGIN_DIR=/absolute/path/to/plugins pnpm dev
```

目录结构应类似：

```text
/absolute/path/to/plugins/
  my-admin/
    index.js
    plugin.config.json
  my-workflow/
    index.js
    plugin.config.json
```

Docker Compose 中可挂载宿主机插件目录，并在容器内设置目标路径：

```bash
MCPHUB_PLUGIN_HOST_DIR=/absolute/path/to/plugins \
MCPHUB_PLUGIN_DIR=/opt/mcphub/plugins \
ADMIN_TOKEN=replace-me \
docker compose up --build -d server
```

## `pnpm test:plugin`

`pnpm test:plugin` 是完整 executor demo，不是任意插件的通用测试器。

它会启动 fixture API 和 MCPHub，加载 `examples/plugins/fake-upload`，调用 MCP `tools/list` 和 `fake.upload.video`，并检查远端调用顺序与 audit checkpoint。

运行：

```bash
pnpm test:plugin
```

当你修改 executor runtime、audit checkpoint 或 fake upload 示例时，应运行这个命令。普通插件开发的快速循环仍然是：

```text
create -> edit -> plugin:verify -> MCPHUB_PLUGIN_DIR pnpm dev
```

## Troubleshooting

`Plugin directory already exists`

目标目录已存在。换一个 plugin name，使用 `--out` 指向空目录，或确认要覆盖时加 `--force`。

`Unknown template`

`--template` 只支持 `http-api` 或 `executor`。

`Invalid plugin name`

使用 lowercase slug。只包含小写字母、数字、`-`、`_`，并以字母或数字开头，例如 `my-admin` 或 `video_upload`。

`Invalid tool name`

使用 `<domain>.<resource>.<action>` 形式的 dot-separated lowercase identifiers，例如 `admin.users.list` 或 `workflow.jobs.run`。

`plugin.config.json` JSON parse error

检查 JSON 逗号、引号和注释。JSON 文件不能包含 JavaScript 注释。

`manifest_validation_error`

检查 `index.js` 是否 default-export manifest，以及 `tools`、`credentials`、`operation`、`executor` 字段是否符合示例形状。

`Missing credential`

确认 `plugin.config.json.credentials` 包含 manifest 中声明的 credential id，并且 `secretRef` 指向 MCPHub server 环境中的变量。

`executor handler ... is missing`

确认 tool 中的 `executor.handler` 名称和 `handlers` 字典里的函数名一致。

插件没有出现在 `tools/list`

确认 `MCPHUB_PLUGIN_DIR` 指向插件父目录，`plugin.config.json` 中 `"enabled": true`，并查看 server 启动日志中的 plugin diagnostics。

`dangerous` 工具被阻止

这是 policy 行为。确认你的 MCP client 或 agent host 已处理审批后，可在 `plugin.config.json` 中把 `policy.dangerousMode` 调整为 `auditOnly` 或 `allow`。
