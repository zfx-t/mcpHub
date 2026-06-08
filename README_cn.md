# MCPHub

MCPHub 是一个可自托管的中间件平台，用来把已有网页内容、REST API、管理后台接口以及可信本地集成代码转换为 MCP resources 和 tools。

这个项目的扩展思路类似 RSSHub：运行一个统一服务，开发者按需添加本地适配器或插件，再向客户端暴露一致的接口。不同的是，MCPHub 面向 AI Agent 输出 MCP 原生能力，而不是 RSS feed。

## 当前能做什么

- 在 `/mcp` 暴露 Streamable HTTP MCP endpoint。
- 将网页内容源转换为 MCP 可读取的资源和工具。
- 从 `MCPHUB_PLUGIN_DIR` 加载可信本地插件。
- 支持声明式 HTTP tool，用于一次请求即可完成的 REST API 操作。
- 支持 executor tool，用插件代码实现多步骤工作流。
- 从环境变量解析凭据。
- 基于 `read`、`write`、`dangerous` 执行工具策略。
- 为插件工具调用记录 audit 证据。
- 提供运行状态和插件诊断接口，方便部署和排查。

## 环境要求

- Node.js 25 或更新版本
- pnpm 10
- Docker，用于 PostgreSQL 和 Docker Compose 验证

## 快速开始

安装依赖并启动本地内存模式服务：

```bash
pnpm install
REQUEST_LOGGING=false pnpm dev
```

另开一个终端验证服务：

```bash
pnpm dev:smoke
```

服务默认地址：

```text
http://localhost:3000
```

MCP endpoint：

```text
http://localhost:3000/mcp
```

使用通用客户端验证 MCP endpoint：

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
```

通用客户端接入和排错说明见 [docs/clients/generic-mcp-client.md](docs/clients/generic-mcp-client.md)。

## Docker 开发栈

启动带 PostgreSQL 和内置 sample admin plugin 的 Docker Compose 服务：

```bash
SAMPLE_ADMIN_API_BASE_URL=http://host.docker.internal:4001 \
SAMPLE_ADMIN_API_TOKEN=dev-token \
docker compose up --build -d server
```

验证 Docker 服务：

```bash
pnpm docker:smoke
```

`docker:smoke` 会检查服务存活、PostgreSQL 模式、MCP 发现、插件工具可见性，以及危险调用被拦截后的 audit 证据。

更完整的部署说明见 [docs/deployment/dev.md](docs/deployment/dev.md)。

## 运维诊断

健康检查：

```bash
curl http://localhost:3000/healthz
```

运行状态：

```bash
curl http://localhost:3000/api/status
```

插件诊断：

```bash
curl http://localhost:3000/api/plugins
```

也可以通过 MCP 读取 Agent 可理解的状态资源：

```bash
curl -X POST http://localhost:3000/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"mcphub://status"}}'
```

更多排查说明见 [docs/operations/diagnostics.md](docs/operations/diagnostics.md)。

## MCP 接口面

当前支持的 JSON-RPC MCP 方法：

- `initialize`
- `resources/list`
- `resources/read`
- `tools/list`
- `tools/call`

平台资源：

- `mcphub://status`
- `mcphub://plugins`
- `mcphub://plugins/{pluginId}`
- `mcphub://plugins/{pluginId}/tools`
- `mcphub://audit/recent`

网页内容资源：

- `webmcp://sources`
- `webmcp://sources/{sourceId}`
- `webmcp://sources/{sourceId}/items`
- `webmcp://items/{itemId}`
- `webmcp://rules/{ruleId}/diagnostics`

内置网页工具：

- `source.search`
- `source.refresh`
- `extract.preview`
- `debug.explain`

当插件被正确加载且启用后，插件工具会出现在 `tools/list` 结果中。

## 本地插件

本地插件是可信的服务端 JavaScript 模块。每个插件目录包含：

```text
plugins/
  my-admin/
    index.js
    plugin.config.json
```

使用插件目录启动 MCPHub：

```bash
MCPHUB_PLUGIN_DIR=/absolute/path/to/plugins pnpm dev
```

创建插件骨架：

```bash
pnpm plugin:create my-admin --template http-api --tool-name my.admin.users.list
pnpm plugin:verify examples/plugins/my-admin
```

创建多步骤工作流插件骨架：

```bash
pnpm plugin:create my-workflow --template executor --tool-name my.workflow.jobs.run
pnpm plugin:verify examples/plugins/my-workflow
```

完整插件开发指南见 [docs/plugins/development.md](docs/plugins/development.md)，插件标准参考见 [docs/plugins/standard.md](docs/plugins/standard.md)。

## HTTP API 插件示例

```js
export default {
  id: "admin-users",
  name: "Admin Users",
  version: "0.1.0",
  type: "api",
  description: "Expose admin user APIs.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["http", "credentials", "policy", "plugin-config"]
  },
  credentials: [{ id: "admin-token", type: "bearer" }],
  tools: [
    {
      name: "admin.users.list",
      description: "List backend users.",
      inputSchema: {
        type: "object",
        properties: { page: { type: "number" } }
      },
      effect: "read",
      credentialRefs: ["admin-token"],
      operation: { type: "http", method: "GET", path: "/api/users" }
    }
  ]
};
```

示例 `plugin.config.json`：

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

## Executor 插件

Executor tool 适合一个 MCP 调用需要插件自有代码完成的场景，例如参数校验、多次 API 调用、上传、轮询、结果归一化等。

一个 executor tool 会声明：

```js
executor: { type: "module", handler: "runWorkflow" }
```

handler 会收到受控运行时上下文：

- `context.config`
- `context.credentials.resolve(id)`
- `context.http.get/post/put/patch/delete`
- `context.checkpoint(step, summary)`
- `context.logger`

可运行的 executor demo 位于：

```text
examples/plugins/fake-upload/
```

端到端验证：

```bash
pnpm test:plugin
```

## 工具策略

每个插件工具都会声明 effect：

- `read`：只读操作
- `write`：写入或修改操作
- `dangerous`：删除、禁用、权限变更等高风险操作

本地插件策略控制 `dangerous` 工具如何执行：

- `block`：返回 `CONFIRMATION_REQUIRED`，不调用远程服务。
- `auditOnly`：执行调用，并记录危险策略 audit 证据。
- `allow`：执行调用，并记录普通 audit 证据。

MCPHub 是中间件。在很多部署方式里，最终工具审批由 MCP client 或 Agent host 负责。MCPHub 会保留 effect 元数据和 audit 证据，让审批系统可以据此做判断。

## 验证

常用检查：

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
pnpm test:plugin
```

运行中服务检查：

```bash
pnpm dev:smoke
pnpm docker:smoke
```

Docker Compose 配置检查：

```bash
docker compose config
```

## 项目结构

```text
apps/
  server/          Fastify 服务，以及 HTTP/MCP 入口
  extension/       浏览器检测扩展

packages/
  core/            共享 schema 和领域类型
  db/              内存与 PostgreSQL repository
  extractors/      网页内容提取
  mcp/             MCP gateway 和 SDK server
  plugins/         插件 SDK、registry、本地 loader
  api-connector/   REST 执行与脱敏
  credentials/     基于环境变量的凭据存储
  policy/          工具策略评估
  audit/           工具调用 audit logger

scripts/           smoke test、fixture、插件 CLI
docs/              部署、运维、插件、设计和计划文档
examples/plugins/  可运行示例插件
```

## Release

当前 release：`v0.1.0`

第一个 dev release 的重点是让 MCPHub 作为中间件平台具备可部署、可检查、可验证的基础能力。
