# 进度日志

## 会话：2026-06-01

### 阶段 12：本地插件加载 P1 设计
- **状态：** in_progress
- **开始时间：** 2026-06-03 CST
- 执行的操作：
  - 使用 `$brainstorming` 与 `$planning-with-files-zh` 继续后续工作规划。
  - 恢复当前规划文件和 Git 状态：`develope` 与 `origin/develope` 对齐，平台化 P0 已完成并推送。
  - 与用户确认：暂不优先实现 server-owned dangerous confirmation UI，因为外部 MCP client/agent host 通常负责工具调用审批。
  - 推荐下一阶段主线：Local Plugin Loading P1，让 MCPHub 从本地目录加载用户预编译 JS 插件。
  - 用户确认推荐方案：通过 `MCPHUB_PLUGIN_DIR` 加载插件目录，每个插件包含 `index.js` 和 `plugin.config.json`。
  - 用户确认 dangerous policy 行为：支持 `block`、`auditOnly`、`allow`，默认 `auditOnly`。
  - 用户确认数据模型、MCP 暴露内容、错误处理、测试和验收标准。
  - 写入设计文档 `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`。
  - 完成设计文档自检：未发现 `TBD`、`TODO`、占位符；范围聚焦 P1 本地插件加载，未混入 OpenAPI/UI/市场等 P2 内容。
- 创建/修改的文件：
  - `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`
  - `task_plan.md`
  - `progress.md`
  - `findings.md`

### 阶段 14：本地插件加载 P1 实现、验证与收尾
- **状态：** complete
- **开始时间：** 2026-06-03 CST
- 执行的操作：
  - 接收最终评审子代理反馈，确认三个问题需要修复：持久化旧插件仍可执行、运行时凭据/配置失败映射不清晰、disabled 插件仍会 import entrypoint。
  - 修复 `packages/plugins/src/local-loader.ts`，让 `enabled:false` 在 import `index.js` 前就被跳过，避免 disabled 插件副作用。
  - 修复 `packages/mcp/src/gateway.ts`，让工具发现与执行权威只来自当前启动时的 `registry`，不再从持久化 repository 兜底读取旧插件/工具。
  - 修复 `packages/mcp/src/gateway.ts` 的错误路径，将缺失 `baseUrl`、缺失 credential binding、credential resolution failure 映射为明确的 `PLUGIN_EXECUTION_ERROR` / `CREDENTIAL_MISSING`，并补失败审计。
  - 增补 `packages/mcp/src/gateway.test.ts` 与 `packages/plugins/src/local-loader.test.ts`，覆盖 stale repository tool、credential missing、disabled plugin side effect 等回归。
  - 运行 focused tests：`packages/plugins/src/local-loader.test.ts`、`packages/mcp/src/gateway.test.ts` 通过。
  - 运行 `pnpm typecheck` 通过。
  - 运行 `pnpm lint`、`pnpm test`、`pnpm build`、`docker compose config` 全部通过。
  - 运行 `pnpm test:e2e` 通过，smoke 输出 `Loaded local plugin local-admin` 和 `Smoke test passed`。
- 创建/修改的文件：
  - `packages/plugins/src/local-loader.ts`
  - `packages/plugins/src/local-loader.test.ts`
  - `packages/mcp/src/gateway.ts`
  - `packages/mcp/src/gateway.test.ts`
  - `task_plan.md`
  - `progress.md`
  - `findings.md`

### 阶段 9：平台化目标重构与新设计探索
- **状态：** in_progress
- **开始时间：** 2026-06-02 12:20 CST
- 执行的操作：
  - 读取 `$brainstorming` 和 `$planning-with-files-zh` 技能说明。
  - 确认当前分支为 `develope`，且 `origin/develope` 已指向最新 Docker 修复提交 `13def5e`。
  - 读取 `task_plan.md`、`findings.md`、`progress.md` 和现有 Web-to-MCP 设计文档。
  - 识别目标升级：从“网页内容转 MCP”扩展为“广泛网站/服务/API/后台能力通过插件适配成 MCP”。
  - 记录当前 MVP 与新目标差距：缺少通用插件运行时、REST/OpenAPI 适配、鉴权、权限策略、审计和操作确认。
  - 形成平台化演进草案：比较 API-first、Web-first、分层通用平台三种路线，并建议 P0 采用 API-first 插件能力 + 保留 Web 内容能力。
  - 向用户展示 MCPHub 平台化设计草案 v0：分层通用平台、P0 REST/API 插件适配、保留 Web 内容插件、增加插件运行时/凭据/策略/审计。
  - 当前处于设计确认门槛：等待用户确认是否采用“分层通用平台，P0 先做 REST/API 插件适配，同时保留 Web 内容插件”的方向；确认前不写正式设计文档、不进入代码实现。
  - 用户确认平台化方向，并要求继续。
  - 写入 `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`。
  - 自检平台化设计文档：未发现 TODO/TBD 占位符；P0/P1/P2 边界、危险操作阻断、插件信任边界和现有 MVP 迁移路径已明确。
  - 用户审阅平台化设计文档并确认没有问题，要求继续。
  - 写入 `docs/superpowers/plans/2026-06-02-mcphub-platform-implementation-plan.md`。
  - 实施计划拆分 Phase 0-11：基线保护、领域模型、数据库、插件 SDK、API Connector、Credential Store、Policy Engine、Audit Log、MCP 聚合、样例 Admin API 插件、配置文档、端到端验证。
- 创建/修改的文件：
  - `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`
  - `docs/superpowers/plans/2026-06-02-mcphub-platform-implementation-plan.md`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 10：平台化 P0 核心实现
- **状态：** complete
- **开始时间：** 2026-06-02 15:53 CST
- 执行的操作：
  - 使用 `$executing-plans` 与 `$subagent-driven-development` 继续执行平台化实施计划。
  - 运行阶段 1-3 既有实现的完整基线：`pnpm test` 通过 7 个测试文件、28 个测试；`pnpm typecheck` 通过。
  - 新增 `@mcphub/api-connector`：JSON REST 执行、path/query/header/body 映射、bearer/header key/query key/basic/cookie/env 凭证注入、timeout、远端错误、URL/输入脱敏。
  - 新增 `@mcphub/credentials`：环境变量 backed credential store，支持 `env:NAME` 和裸环境变量引用。
  - 新增 `@mcphub/policy`：read/write/dangerous 策略、工具启用检查、host/method/path 限制、dangerous confirmation-required 结果。
  - 新增 `@mcphub/audit`：审计记录 helper/logger、recent 查询、写入 repository 时复用 DB redaction。
  - 修复 API tool durable contract：`defineApiTool()` 生成 `operation: { type: "http", method, path }`，core schema、registry、repository、Postgres 均保留该字段。
  - 修复凭证引用边界：`Credential.requirementId` 区分 manifest requirement 与 DB credential record，repository 支持 `getCredentialForRequirement(pluginId, requirementId)`。
  - 调整 audit_records 外键不再 `ON DELETE CASCADE`，避免删除插件时级联删除审计证据。
  - 新增 `sampleAdminPlugin`，暴露 `admin.users.list` 和 `admin.users.disable`。
  - 新增 server platform bootstrap：通过 `SAMPLE_ADMIN_API_BASE_URL`、`SAMPLE_ADMIN_API_TOKEN_ENV`、`SAMPLE_ADMIN_API_TOKEN` 显式启用 sample admin plugin，并向 repository 写入 plugin/tool/credential metadata。
  - 扩展 MCP Gateway：可选聚合 plugin registry，新增 `mcphub://plugins`、`mcphub://plugins/{pluginId}`、`mcphub://plugins/{pluginId}/tools`、`mcphub://audit/recent`，并让 API plugin tool 走 policy -> credentials -> connector -> audit。
  - 扩展官方 SDK MCP transport：平台插件 tools 会注册到 `tools/list`，并通过同一个 `gateway.callTool()` 路径执行；JSON Schema 会转换为 Zod shape，避免 SDK transport 丢弃 tool 参数。
  - 新增管理后台 fixture 测试：`admin.users.list` 通过 MCP 调用远端 fixture；`admin.users.disable` 无 confirmation 时返回 `CONFIRMATION_REQUIRED` 且远端未被调用，audit 可读取 blocked 记录。
  - 扩展 `scripts/smoke.ts`：覆盖 server startup、Web resource read、plugin resource、tools/list、`admin.users.list`、`admin.users.disable` 阻断、audit recent。
  - 新增 `scripts/admin-fixture.ts` 和 `pnpm fixture:admin`，用于 Docker Compose sample admin plugin smoke。
  - 删除 `packages/core/src` 下旧 TypeScript 编译生成物，避免测试加载旧 JS。
  - 更新 README 和 `.env.example`，补充平台资源、API 插件示例、环境变量凭证、sample admin plugin 配置和 dangerous 工具行为。
- 当前验证：
  - Focused tests：`apps/server`、`packages/mcp`、`packages/core/db/plugins/credentials/policy/api-connector/audit` 相关测试通过。
  - `pnpm test`：11 个测试文件、48 个测试通过。
  - `pnpm lint`：通过。
  - `pnpm build`：通过。
  - `pnpm typecheck`：通过。
  - `pnpm test:e2e`：`Smoke test passed`。
  - `SAMPLE_ADMIN_API_BASE_URL=http://host.docker.internal:4001 SAMPLE_ADMIN_API_TOKEN=secret-token docker compose up --build -d server`：server 与 postgres 启动成功。
  - 容器插件 smoke：`/healthz`、`mcphub://plugins`、`tools/list` 包含 sample admin tools、`admin.users.list` 成功调用 host fixture、`admin.users.disable` 返回 `CONFIRMATION_REQUIRED`、host fixture `disableCalls` 保持 0、`mcphub://audit/recent` 包含 blocked call、`inputSummary.id=user-1` 和正确 target。
- 完成时间：2026-06-02 18:31 CST

### 阶段 1：上下文与需求发现
- **状态：** complete
- **开始时间：** 2026-06-01 15:01 Asia/Shanghai
- 执行的操作：
  - 读取 brainstorming 与 planning-with-files-zh 技能说明。
  - 检查工作目录、项目文件、规划文件和 Git 状态。
  - 创建本次设计任务的 task_plan.md、findings.md、progress.md。
  - 调研 MCP 官方最新规范、Resources、Tools、Transports，以及 RSSHub 路由/调试相关文档摘要。
  - 确认用户选择混合模式，并希望加入浏览器插件判断网站是否可获得 MCP 内容。
  - 初始理解为插件检测/标注；随后用户明确收窄为只发送网站信息给服务器并展示结果，不标注、不抓取。
  - 确认 MCP 暴露采用 Resources + Tools 组合。
  - 调研浏览器扩展内容脚本、消息通信和 Native Messaging 的官方文档约束。
  - 确认部署形态为服务端 MCP，可自部署或使用公开服务。
- 创建/修改的文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 2：方案比较
- **状态：** complete
- 执行的操作：
  - 整理 3 种可选架构方案。
  - 准备推荐服务端 MCP + 插件检测入口 + 混合抽取架构。
  - 用户确认推荐架构方向无问题，但后续修正插件职责为查询展示入口。
  - 提出 Source、Rule、Document、FeedItem 四层对象模型，并得到用户认可。
  - 提出 MCP Resources/Tools 接口范围，并得到用户确认。
  - 修正并确认插件设计：插件只做 MCP 可用性查询入口。
  - 提出服务端插件查询链路、Agent/MCP 读取链路和错误处理模型，并得到用户确认。
  - 用户确认 MVP 范围。
- 创建/修改的文件：
  - `task_plan.md`
  - `progress.md`
  - `findings.md`

### 阶段 3：设计定稿
- **状态：** complete
- 执行的操作：
  - 确认核心模块、数据流、错误处理、MVP 范围和验收标准。
- 创建/修改的文件：
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 4：设计文档
- **状态：** complete
- 执行的操作：
  - 写入 `docs/superpowers/specs/2026-06-01-web-to-mcp-design.md`。
  - 自检占位符、矛盾、范围和歧义。
  - 修正 `rule.validate` 的 MVP 范围：插件职责收窄后该工具后置。
  - 检查 Git 状态，发现当前 `.git` 为空目录，无法提交。
  - 准备请求用户审阅设计文档。
  - 用户要求初始化 Git 仓库并设置 main 分支。
  - 沙箱内 `.git` 是只读挂载，普通 `git init` 失败；提升权限后在真实文件系统中完成 `git init -b main`。
  - 确认设计文档已提交，提交为 `8dc3a68 Add web-to-mcp design`。
- 创建/修改的文件：
  - `docs/superpowers/specs/2026-06-01-web-to-mcp-design.md`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 5：设计文档审阅与实施计划准备
- **状态：** complete
- **开始时间：** 2026-06-01 19:23 CST
- 执行的操作：
  - 恢复并读取 `task_plan.md`、`findings.md`、`progress.md`。
  - 运行会话恢复脚本，未发现需要补录的额外上下文。
  - 核对设计文档和 Git 状态：当前分支为 `main`，最新提交为 `8dc3a68 Add web-to-mcp design`。
  - 将规划文件更新为“设计文档已提交，等待用户审阅后再进入实施计划”。
  - 用户审阅设计文档并确认没有问题。
  - 创建 `docs/superpowers/plans/2026-06-01-web-to-mcp-implementation-plan.md`。
  - 实施计划拆分为项目脚手架、领域模型与存储、检测 API、抽取与缓存、MCP gateway、浏览器插件、部署运维、端到端验证。
- 完成时间：2026-06-01 19:34 CST

### 阶段 6：实施计划审阅与实现启动
- **状态：** complete
- **开始时间：** 2026-06-01 19:34 CST
- 执行的操作：
  - 将当前阶段推进到实施计划审阅与实现启动。
  - 记录实施计划的技术栈假设：TypeScript monorepo、pnpm workspaces、官方 MCP SDK、PostgreSQL、Manifest V3 extension。
  - 用户要求继续完成工作直到 plan 全部完成。
  - 创建实现分支 `implement-web-to-mcp-mvp`。
  - 完成 TypeScript monorepo、server、extension、core、db、extractors、mcp packages、Docker/Compose、README、smoke 脚本。
  - 根据规格审查补齐 validated rule runner、第三个 custom route、失败 backoff、官方 MCP SDK Streamable HTTP route、request id/logging/rate limit、server+postgres compose、真实 HTTP smoke。
- 完成时间：2026-06-01 21:44 CST

### 阶段 7：最终审查与收尾
- **状态：** complete
- **开始时间：** 2026-06-01 21:44 CST
- 执行的操作：
  - 运行 `pnpm typecheck`：通过。
  - 运行 `pnpm lint`：通过。
  - 运行 `pnpm test`：6 个测试文件、14 个测试通过。
  - 运行 `pnpm build`：通过。
  - 运行 `pnpm test:e2e`：通过，输出 `Smoke test passed`。
  - 运行 `docker compose config`：通过，包含 server 和 postgres。
  - 尝试 `docker build -t mcphub:dev .` 两次，均因 Docker Hub 拉取 `node:25-alpine` 网络超时失败。
  - 最终重跑 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e`：均通过。
  - 完成计划 Phase 0-7 的本地完成审计。
- 完成时间：2026-06-01 21:54 CST

### 阶段 8：Docker Compose 端到端复测
- **状态：** complete
- **开始时间：** 2026-06-02 11:45 CST
- 执行的操作：
  - 修复 Dockerfile：`node:25-alpine` 镜像内没有可用 `corepack`，改为安装固定版本 `pnpm@10.32.1`。
  - 修复 PostgreSQL JSONB 写入：对象和数组参数统一序列化后传给 `pg`。
  - 修复真实 Docker smoke 的 seed URL：`https://example.com/articles/hello` 返回 404，改为 `https://example.com/`。
  - 为 custom route 增加正文 fallback：目标 selector 没有内容时读取 `article, main, body`。
  - 运行 `pnpm typecheck`、`pnpm test`、`pnpm lint`、`pnpm build`、`pnpm test:e2e`：均通过。
  - 运行 `docker compose up --build -d server`：server 和 postgres 均启动成功。
  - 验证 Docker 服务：`/healthz` 返回 200，`/api/detect-site` 返回 `available`，MCP `resources/list`、`source.refresh`、item `resources/read`、`debug.explain` 均通过。
- 完成时间：2026-06-02 11:57 CST

## 测试结果
| 测试 | 输入 | 预期结果 | 实际结果 | 状态 |
|------|------|---------|---------|------|
| 项目上下文检查 | `rg --files`、`ls -la`、`git log --oneline -5` | 了解仓库状态 | 目录基本为空，git log 失败 | 完成 |

## 错误日志
| 时间戳 | 错误 | 尝试次数 | 解决方案 |
|--------|------|---------|---------|
| 2026-06-02 11:45 CST | Docker build 阶段 `corepack: not found` | 1 | Dockerfile build/runtime 阶段改为 `npm install -g pnpm@10.32.1` |
| 2026-06-02 11:48 CST | Docker server seed 写入 JSONB 报 `invalid input syntax for type json` | 1 | JSONB 字段写入前统一 `JSON.stringify` |
| 2026-06-02 11:53 CST | Docker `source.refresh` 使用旧 sample URL 时真实网络返回 404 | 1 | seed URL 改为 `https://example.com/`，custom route 增加正文 fallback |
| 2026-06-01 15:01 | `git log` 返回 fatal: not a git repository | 1 | 记录环境约束，继续设计流程 |
| 2026-06-01 19:00 | `git status` 返回 fatal: not a git repository，`.git` 为空目录 | 1 | 无法执行 spec commit，记录并继续交付设计文档 |
| 2026-06-01 19:07 | 普通 `git init -b main` 失败：`.git/branches` 只读文件系统 | 1 | 使用提升权限在真实文件系统初始化仓库 |

## 五问重启检查
| 问题 | 答案 |
|------|------|
| 我在哪里？ | 全部计划阶段已完成 |
| 我要去哪里？ | 等待用户验收或后续扩展需求 |
| 目标是什么？ | 设计网页抓取到 MCP/Agent 可读内容的工具 |
| 我学到了什么？ | 见 findings.md |
| 我做了什么？ | 见上方记录 |

### 阶段 13：本地插件加载 P1 实施计划
- **状态：** in_progress
- **开始时间：** 2026-06-03 CST
- 执行的操作：
  - 用户确认 `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md` 没有问题，并要求继续进入实施计划。
  - 读取 P0 平台实施计划、P1 设计文档、当前规划文件和 Git 状态。
  - 检查当前实现接缝：
    - `apps/server/src/config.ts` 尚未读取 `MCPHUB_PLUGIN_DIR`。
    - `apps/server/src/platform.ts` 当前只在 `SAMPLE_ADMIN_API_BASE_URL` 存在时装配 sample admin plugin。
    - `packages/plugins/src/sdk.ts` 已提供 `definePlugin` 和 `defineApiTool`，可作为本地插件模块契约。
    - `packages/policy/src/engine.ts` 当前对 dangerous 工具固定返回 `CONFIRMATION_REQUIRED`。
    - `packages/mcp/src/gateway.ts` 已能通过 registry、credential store、policy 和 audit 执行 API plugin tool。
    - `scripts/smoke.ts` 已覆盖 fixture REST、sample admin plugin、dangerous block 和 audit，可扩展本地插件 smoke。
  - 创建 `docs/superpowers/plans/2026-06-03-local-plugin-loading-implementation-plan.md`。
  - 将实施拆分为 Phase 0-11：baseline、配置、config schema、filesystem loader、repository seeding、platform composition、dangerous policy、MCP/audit、smoke、Docker、文档和最终验证。
  - 完成实施计划自检：未发现真实占位符；范围聚焦 P1 本地插件加载，包含验收标准、风险缓解和延后范围。
- 下一步：
  - 用户审阅实施计划。
  - 用户确认后再进入代码实现。

### 阶段 15：插件自定义执行器 P2 规划
- **状态：** in_progress
- **开始时间：** 2026-06-03 CST
- 执行的操作：
  - 用户确认当前本地插件第一版可行，但后续重点应放在第二版：插件自定义执行器。
  - 明确目标用例：B 站上传视频插件需要一个 tool 内部调用多个 API，包括校验、上传、提交、状态查询等步骤。
  - 确认该能力应作为后续发展阶段规划，而不是塞进当前声明式 HTTP operation。
  - 在 `task_plan.md` 中新增阶段 15：插件自定义执行器 P2 设计。
  - 在 `findings.md` 中记录 executor runtime 的边界：插件负责业务 workflow，MCPHub 负责加载、策略、凭据、审计和错误边界。
  - 用户确认阶段 15 同时完成设计文档和实施计划，并认可“保留声明式 HTTP 插件，新增自定义 executor tool”路线。
  - 写入设计文档 `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md`。
  - 写入实施计划 `docs/superpowers/plans/2026-06-03-plugin-executor-runtime-implementation-plan.md`。
  - 设计范围明确为 P2 executor runtime，不实现真实 B 站上传插件；使用 fake multi-step upload fixture 作为验收用例。
- 创建/修改的文件：
  - `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md`
  - `docs/superpowers/plans/2026-06-03-plugin-executor-runtime-implementation-plan.md`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 16：插件自定义执行器 P2 实现、验证与收尾
- **状态：** complete
- **开始时间：** 2026-06-03 CST
- 执行的操作：
  - 使用 `$executing-plans` 和子代理辅助审阅 gateway/audit/connector 接入点，确认执行权威必须继续来自当前 registry/handler map。
  - 扩展 `packages/core/src/types.ts` 和 `packages/core/src/schemas.ts`：新增 `PluginTool.executor` / `ModulePluginToolExecutor`，并要求工具只能二选一声明 `operation` 或 `executor`。
  - 扩展 `packages/plugins/src/sdk.ts`：新增 `defineExecutorTool()`、`PluginExecutorContext`、`PluginHandler`、`PluginHandlers`，并让 `definePlugin()` 保留 runtime-only `handlers`。
  - 扩展 `packages/plugins/src/local-loader.ts`：本地插件加载时保留 handlers map，诊断 executor tool 引用缺失 handler 或非函数 handler；disabled 插件仍在 import 前跳过。
  - 扩展 `packages/plugins/src/registry.ts`、`packages/db/src/schema.sql`、`packages/db/src/postgres.ts`：保留 executor 元数据，但不持久化 handler 函数。
  - 新增 `packages/mcp/src/executor-runtime.ts`：实现 handler 调用、context.config、credential resolve、JSON HTTP helper、checkpoint audit、错误归一化。
  - 扩展 `packages/mcp/src/gateway.ts`：policy 先于 handler 执行；HTTP operation 继续走 connector；executor tool 走 runtime；stale repository executor tool 不可执行。
  - 扩展 `apps/server/src/platform.ts`：将 `loadLocalPlugins()` 返回的 `handlers` 传给 MCP gateway。
  - 增补测试：core schema、plugin SDK/registry/local-loader、executor runtime、gateway executor policy/audit/stale、DB executor 元数据、audit/policy fixture。
  - 扩展 `scripts/smoke.ts`：新增 fake multi-step upload executor 插件，覆盖 dryRun、session/part/submit/status 顺序、checkpoint audit；新增 blocked executor 插件验证 dangerous block 不调用 handler。
  - 更新 README：补充 HTTP vs executor、executor 插件示例、context API、checkpoint/dryRun、trusted local code 边界。
- 当前验证：
  - `pnpm vitest run packages/core/src/core.test.ts packages/plugins/src/registry.test.ts packages/plugins/src/local-loader.test.ts`：3 个测试文件、38 个测试通过。
  - `pnpm vitest run packages/mcp/src/executor-runtime.test.ts packages/mcp/src/gateway.test.ts packages/db/src/repository.test.ts packages/audit/src/logger.test.ts packages/policy/src/engine.test.ts`：5 个测试文件、29 个测试通过。
  - `pnpm test`：13 个测试文件、85 个测试通过。
  - `pnpm typecheck`：通过。
  - `pnpm test:e2e`：加载 `blocked-upload`、`fake-upload`、`local-admin`，输出 `Smoke test passed`。
  - `pnpm build`：通过。
  - `pnpm lint`：通过。
  - `docker compose config`：通过。
  - `git diff --check`：通过。
- 遇到并解决的问题：
  - project reference 使用旧 `dist/*.d.ts` 导致 plugins/mcp/server 看不到新类型；通过重建 `@mcphub/core`、`@mcphub/plugins`、`@mcphub/mcp` 声明解决。
  - schema 收紧后旧测试夹具缺少执行模式；已为 DB/audit/policy/core/plugin fixture 补 `operation` 或 `executor`。
  - credential missing 场景现在按设计保留 `allowed + failed` 两条审计；已更新测试预期。
  - lint 发现 executor runtime 测试未使用导入；已删除。
- 创建/修改的主要文件：
  - `packages/core/src/types.ts`
  - `packages/core/src/schemas.ts`
  - `packages/plugins/src/sdk.ts`
  - `packages/plugins/src/local-loader.ts`
  - `packages/plugins/src/registry.ts`
  - `packages/mcp/src/executor-runtime.ts`
  - `packages/mcp/src/gateway.ts`
  - `apps/server/src/platform.ts`
  - `packages/db/src/schema.sql`
  - `packages/db/src/postgres.ts`
  - `scripts/smoke.ts`
  - `README.md`
  - 相关测试文件
- 完成时间：2026-06-03 CST

### 阶段 17：插件验证 Demo 固化
- **状态：** complete
- **开始时间：** 2026-06-05 CST
- 执行的操作：
  - 用户确认下一步先固化插件验证 demo，让用户能直接查看插件代码并照着运行。
  - 新增常驻示例插件 `examples/plugins/fake-upload/index.js` 和 `plugin.config.json`。
  - 新增 `scripts/verify-example-plugin.ts`，脚本会启动 fixture API、启动 MCPHub、加载示例插件，并通过 MCP HTTP 调用验证 `tools/list`、dryRun、真实多步骤 workflow、audit checkpoint。
  - 更新 `README.md`，补充 `examples/plugins/fake-upload` 目录和 `pnpm test:plugin` 使用方式。
- 当前验证：
  - `pnpm test:plugin`：普通沙箱下被 `listen EPERM 127.0.0.1` 拦截；提升本地监听权限后通过，输出 `Example executor plugin verification passed`。
  - `pnpm lint`：通过。
  - `pnpm typecheck`：通过。
- 创建/修改的文件：
  - `examples/plugins/fake-upload/index.js`
  - `examples/plugins/fake-upload/plugin.config.json`
  - `scripts/verify-example-plugin.ts`
  - `package.json`
  - `README.md`
  - `task_plan.md`
  - `findings.md`
  - `progress.md`

### 阶段 18：插件开发者体验设计
- **状态：** in_progress
- **开始时间：** 2026-06-07 CST
- 执行的操作：
  - 用户要求继续规划下一阶段工作，并确认优先按照“插件开发者体验”推进。
  - 已恢复当前 Git、任务计划、进度、发现记录和最近提交上下文。
  - 已检查当前 `package.json` 脚本、`packages/plugins/src/sdk.ts` 插件 SDK、README 中本地插件/executor/demo 文档，以及 `examples/plugins/fake-upload` 和 `scripts/verify-example-plugin.ts`。
  - 初步确认下一阶段应围绕插件脚手架、插件开发文档、本地调试/验证命令和模板化示例展开。
  - 用户确认首版脚手架采用参数式 CLI，不做交互式向导；生成后的业务代码由用户自行修改。
  - 用户确认采用方案 C：`plugin:create` + `plugin:verify` + 开发文档。
  - 写入设计文档 `docs/superpowers/specs/2026-06-07-plugin-developer-experience-design.md`。
  - 完成设计文档自检：无 TBD/TODO；范围明确排除交互式 CLI、插件市场、真实第三方 API 生成、OpenAPI import 和浏览器自动化；修正一处中英文粘连表述。
  - 用户确认设计文档没有问题，要求继续完成实施计划。
  - 写入实施计划 `docs/superpowers/plans/2026-06-07-plugin-developer-experience-implementation-plan.md`。
  - 实施计划拆分为 Phase 0-9：基线、CLI 入口、参数校验、HTTP 模板、executor 模板、plugin verify、测试、文档、最终验证、提交交付。
- 下一步：
  - 用户审阅实施计划。
  - 用户确认后进入阶段 19 代码实现。

### 阶段 19：插件开发者体验实现、验证与收尾
- **状态：** in_progress
- **开始时间：** 2026-06-07 CST
- 执行的操作：
  - 用户要求使用 `$executing-plans` 和 `$subagent-driven-development` 持续执行到计划完成。
  - 读取并审查 `docs/superpowers/plans/2026-06-07-plugin-developer-experience-implementation-plan.md`，未发现阻塞问题。
  - Phase 0 基线：`pnpm typecheck` 通过；`pnpm test` 13 个测试文件、85 个测试通过；`pnpm test:plugin` 普通沙箱下被本地监听权限拦截，提升权限后通过并输出 `Example executor plugin verification passed`。
  - 实现 `plugin:create` / `plugin:verify` 参数式 CLI，并将 package scripts 改为 `node --import tsx ...`，避免 `tsx` CLI 在当前沙箱内创建 IPC pipe 被 `listen EPERM` 拦截。
  - 新增共享 CLI helper、HTTP API 模板、executor 模板和 verifier，`plugin:verify` 复用现有 local plugin loader。
  - 新增 `scripts/plugin-cli.test.ts`，覆盖 HTTP/executor 生成验证、重复目录、非法参数、缺失目录、缺失 executor handler 和 disabled plugin。
  - 新增 `docs/plugins/development.md`，并在 README API Plugins 章节加入开发指南入口。
- 当前验证：
  - `pnpm vitest run scripts/plugin-cli.test.ts`：1 个测试文件、8 个测试通过。
  - `pnpm plugin:create dev-http --template http-api --out /tmp/mcphub-plugin-devx --tool-name dev.http.read --force`：通过。
  - `pnpm plugin:create dev-executor --template executor --out /tmp/mcphub-plugin-devx --tool-name dev.executor.run --force`：通过。
  - `pnpm plugin:verify /tmp/mcphub-plugin-devx/dev-http`：通过。
  - `pnpm plugin:verify /tmp/mcphub-plugin-devx/dev-executor`：通过。
  - `pnpm lint`：通过。
  - `pnpm typecheck`：通过。
  - `pnpm test`：14 个测试文件、93 个测试通过。
  - `pnpm plugin:create dev-http --template http-api --out /tmp/mcphub-plugin-devx-final --tool-name dev.http.read --force`：通过。
  - `pnpm plugin:create dev-executor --template executor --out /tmp/mcphub-plugin-devx-final --tool-name dev.executor.run --force`：通过。
  - `pnpm plugin:verify /tmp/mcphub-plugin-devx-final/dev-http`：通过。
  - `pnpm plugin:verify /tmp/mcphub-plugin-devx-final/dev-executor`：通过。
  - `pnpm test:plugin`：提升本地监听权限后通过，输出 `Example executor plugin verification passed`。
  - `git diff --check`：通过。
- 评审与修复：
  - spec reviewer 初审发现实施计划要求 plugin slug 支持 `_`，但 CLI/core schema 不一致；已扩展 `pluginIdSchema` 支持 `_`，同步 CLI 校验、文档和测试。
  - code quality reviewer 初审发现 `--force` 可能递归删除任意目录；已改为只覆盖已确认是同 id MCPHub 插件目录的生成文件，并补非插件目录拒绝覆盖测试。
  - code quality reviewer 初审发现 `plugin:verify` 按 basename 匹配 manifest 可能选错 sibling；已改为通过 `loaded_plugin` diagnostic 的 exact `pluginDir` 绑定目标 manifest，并补目录名与 manifest id 不一致场景测试。
  - code quality re-review：APPROVED。
- 最终验证：
  - `pnpm test`：14 个测试文件、97 个测试通过。
  - `pnpm lint`：通过。
  - `pnpm typecheck`：通过。
  - `pnpm plugin:create dev-http --template http-api --out /tmp/mcphub-plugin-devx-final3 --tool-name dev.http.read --force`：通过。
  - `pnpm plugin:create dev-executor --template executor --out /tmp/mcphub-plugin-devx-final3 --tool-name dev.executor.run --force`：通过。
  - `pnpm plugin:create dev_exec --template executor --out /tmp/mcphub-plugin-devx-final3 --tool-name dev.exec.run --force`：通过。
  - `pnpm plugin:verify /tmp/mcphub-plugin-devx-final3/dev-http`：通过。
  - `pnpm plugin:verify /tmp/mcphub-plugin-devx-final3/dev-executor`：通过。
  - `pnpm plugin:verify /tmp/mcphub-plugin-devx-final3/dev_exec`：通过。
  - `pnpm test:plugin`：提升本地监听权限后通过，输出 `Example executor plugin verification passed`。
  - `git diff --check`：通过。
- 创建/修改的文件：
  - `package.json`
  - `packages/core/src/schemas.ts`
  - `packages/core/src/core.test.ts`
  - `scripts/plugin-create.ts`
  - `scripts/plugin-verify.ts`
  - `scripts/plugin-dev/common.ts`
  - `scripts/plugin-dev/create.ts`
  - `scripts/plugin-dev/templates.ts`
  - `scripts/plugin-dev/verify.ts`
  - `scripts/plugin-cli.test.ts`
  - `docs/plugins/development.md`
  - `README.md`
  - `task_plan.md`
  - `progress.md`
- 完成时间：2026-06-07 CST

### 阶段 20：后续路线规划
- **状态：** in_progress
- **开始时间：** 2026-06-07 CST
- 执行的操作：
  - 用户要求继续规划后面的工作计划，并指定使用 `$brainstorming` 和 `$planning-with-files-zh`。
  - 已重新读取技能说明、Git 状态、最近提交、`task_plan.md`、`progress.md`、`findings.md` 和现有设计/计划/插件文件清单。
  - 当前分支 `develope` 比 `origin/develope` 领先 5 个提交。
  - 当前工作树存在未跟踪目录 `examples/plugins/my-admin/` 和 `examples/plugins/my-workflow/`，判断为用户按教程生成的本地实验插件，后续规划不清理、不提交、不覆盖。
  - 已将 `task_plan.md` 当前阶段更新为阶段 20，并将阶段 18 补标为 complete。
  - 用户明确否定继续优化单一插件/业务样板的预测方向，要求对齐 RSSHub 式平台方向：可自部署、开发者可扩展、通过标准约定把没有 MCP 的能力无痛转换为 MCP。
  - 重新读取 README、package scripts、规划文件和当前仓库状态，确认现有底座已有 MCP endpoint、Docker、插件加载、HTTP/executor tool、凭据、策略、审计和开发者 CLI，但尚缺少一个“可上线/可应用 dev 版本”的产品化闭环。
  - 将下一阶段规划目标修正为 dev release readiness：稳定运行配置、部署验收、实例可观测/诊断、开发者扩展标准和可复现 smoke，而不是继续增加具体业务插件。
  - 用户认可推荐优先级：先做“部署可用 + 平台可见性”组合路线，再进入开发者标准强化。
- 下一步：
  - 已提出三种路线：部署可用、平台可见性、两者合并；用户确认采用合并路线。
  - 写入设计文档 `docs/superpowers/specs/2026-06-07-dev-release-readiness-design.md`。
  - 完成设计文档自检：新文档未发现 TBD/TODO/FIXME/占位符；范围明确排除管理 UI、插件市场、远程插件安装、多租户认证、生产级安全加固和更多业务插件样例。
  - 下一步提交设计文档，并请求用户审阅后再进入实施计划。

### 阶段 21：Dev 版本上线能力实施计划
- **状态：** in_progress
- **开始时间：** 2026-06-08 CST
- 执行的操作：
  - 用户认可 `docs/superpowers/specs/2026-06-07-dev-release-readiness-design.md`，要求继续。
  - 恢复设计文档、`task_plan.md`、`progress.md`、当前 Git 状态和仓库文件结构。
  - 当前分支 `develope` 比 `origin/develope` 领先 6 个提交。
  - 当前仍有未跟踪用户实验插件目录 `examples/plugins/my-admin/` 和 `examples/plugins/my-workflow/`，实施计划明确不删除、不覆盖、不提交。
  - 写入实施计划 `docs/superpowers/plans/2026-06-08-dev-release-readiness-implementation-plan.md`。
- 下一步：
  - 完成实施计划自检：计划覆盖状态模型、HTTP status/plugins API、MCP status resource、MCP 可见性摘要、local/Docker smoke、部署与诊断文档、测试和最终验证。
  - 下一步提交实施计划和规划文件，并请求用户审阅后再进入代码实现。

### 阶段 22：Dev 版本上线能力实现
- **状态：** in_progress
- **开始时间：** 2026-06-08 CST
- 执行的操作：
  - 用户要求使用 `$executing-plans` 与 `$subagent-driven-development` 按实施计划完成任务。
  - 已读取两个技能说明和 `docs/superpowers/plans/2026-06-08-dev-release-readiness-implementation-plan.md`。
  - 当前分支 `develope` 比 `origin/develope` 领先 7 个提交；工作树仍有未跟踪用户实验插件目录 `examples/plugins/my-admin/` 与 `examples/plugins/my-workflow/`，继续不删除、不覆盖、不提交。
  - Phase 0 基线验证通过：
    - `pnpm typecheck` 通过。
    - `pnpm test` 通过，14 个测试文件、97 个测试。
    - `pnpm test:plugin` 通过，输出 `Example executor plugin verification passed`。
    - `pnpm test:e2e` 通过，输出 `Smoke test passed`。
    - `docker compose config` 通过。
- 下一步：
  - 实现 Phase 1-4：运行状态模型、HTTP status/plugins API、MCP status resource 和 MCP 可见性摘要。
  - 实现 `PlatformStatusSummary` 和 `mcphub://status`，并让 HTTP `/api/status` 复用同一套 gateway status builder。
  - 新增 `/api/plugins`，返回已加载插件摘要和 local loader diagnostics。
  - 扩展 `createPlatformServices()`，把 local plugin diagnostics、runtime repository mode、pluginDir、audit availability 带入 `PlatformGatewayOptions`；修复无插件但启用 PostgreSQL 时 status 丢失 repository mode 的问题。
  - 新增 `scripts/smoke-helpers.ts`、`scripts/dev-smoke.ts`、`scripts/docker-smoke.ts`，并添加 `pnpm dev:smoke`、`pnpm docker:smoke`。
  - 扩展 `scripts/smoke.ts`，覆盖 `/api/status`、`/api/plugins` 和 `mcphub://status`。
  - 新增文档 `docs/deployment/dev.md` 与 `docs/operations/diagnostics.md`，更新 README 和 `.env.example`。
  - 当前验证：
    - `pnpm vitest run apps/server/src/app.test.ts packages/mcp/src/gateway.test.ts` 通过，2 个测试文件、18 个测试。
    - `pnpm typecheck` 通过。
    - `pnpm test:e2e` 通过。
    - `pnpm dev:smoke` 通过，输出 `Dev smoke passed for http://127.0.0.1:3000`。
    - `pnpm lint` 通过。
    - `pnpm test` 通过，14 个测试文件、99 个测试。
    - `pnpm test:plugin` 通过。
    - `pnpm build` 通过。
    - `docker compose config` 通过。
    - `docker compose up --build -d server` 成功，期间 npm registry 有一次 `ERR_SOCKET_TIMEOUT` 重试但最终构建成功。
    - `pnpm docker:smoke` 通过，输出 `Docker smoke passed for http://127.0.0.1:3000`。
- 规格审查反馈与修复：
  - 规格审查指出 Docker smoke 只验证 JSON shape，未证明插件状态和 audit path；已增强 `scripts/smoke-helpers.ts` 和 `scripts/docker-smoke.ts`，要求 Docker smoke 验证插件工具、plugin/audit resources，调用 `admin.users.disable` 并确认 blocked audit 出现在 `mcphub://audit/recent`。
  - 规格审查指出 database health 静态写死为 true；已改为 `WebMcpGateway.getStatusSummary()` 在数据库配置存在时通过 repository 轻量查询确认健康。
  - 规格审查指出 `expectPlugins` 语义过弱；已改为要求至少一个 loaded plugin，并验证 MCP plugin/audit resources 和指定插件 tool。
  - 规格审查指出未记录 `git diff --check`；已运行 `git diff --check` 并通过。
  - 更新 README 和 `docs/deployment/dev.md`，明确 Docker smoke 需要通过 sample admin plugin 验证 plugin/audit 路径。
  - 修复后复测：
    - `pnpm typecheck` 通过。
    - `pnpm vitest run apps/server/src/app.test.ts packages/mcp/src/gateway.test.ts` 通过。
    - `pnpm test:e2e` 通过。
    - `SAMPLE_ADMIN_API_BASE_URL=http://host.docker.internal:4001 SAMPLE_ADMIN_API_TOKEN=dev-token docker compose up --build -d server` 成功，期间 npm registry 有 `ERR_SOCKET_TIMEOUT` 重试但最终构建成功。
    - `pnpm docker:smoke` 通过。
    - `git diff --check` 通过。
  - 代码质量审查指出 `/api/status` 不应随 audit 表增长、DB 异常不能导致 500、`/api/plugins` 不应泄漏完整本地路径、`/api/plugins` 不应依赖 MCP JSON 字符串反序列化；已修复：
    - `getStatusSummary()` 不再读取 audit 表，只报告 audit availability。
    - 数据库配置存在时通过 repository 轻量查询判定健康，异常返回 `status: "degraded"` 和 `databaseHealthy: false`。
    - 新增 typed `getPlatformDiagnostics()`，`/api/plugins` 直接调用 typed gateway 方法，不再 `JSON.parse(readResource(...))`。
    - plugin metadata 和 diagnostics 中的本地路径压缩为末尾两段，diagnostic details 不暴露。
    - `dev:smoke` 默认不要求插件；只有 `MCPHUB_SMOKE_EXPECT_PLUGINS=true` 时才执行插件严格检查。
  - 质量修复后复测：
    - `pnpm vitest run apps/server/src/app.test.ts packages/mcp/src/gateway.test.ts` 通过，2 个测试文件、19 个测试。
    - `pnpm typecheck` 通过。
    - `MCPHUB_BASE_URL=http://127.0.0.1:3001 pnpm dev:smoke` 通过。
    - `pnpm test` 通过，14 个测试文件、100 个测试。
    - `pnpm lint` 通过。
    - `pnpm test:e2e` 通过。
    - `pnpm docker:smoke` 通过。
    - `git diff --check` 通过。
    - `pnpm build` 通过。
    - `pnpm test:plugin` 通过。
- 下一步：
  - 代码质量复审通过，确认当前工作树未发现必须修复项。
  - 已按功能拆分提交：
    - `257a62c Add platform status diagnostics`
    - `a84ed81 Add dev release smoke checks`
    - `fea16dd Document dev release operations`
  - 补齐规划文件状态：阶段 21、阶段 22 均完成。

---
*每个阶段完成后或遇到错误时更新此文件*

### 阶段 23：v0.1.0 后续路线规划
- **状态：** complete
- **开始时间：** 2026-06-08 11:00:29 CST
- 执行的操作：
  - 用户要求继续规划后面的工作，并指定使用 `$brainstorming` 和 `$planning-with-files-zh`。
  - 已恢复当前 Git 状态、近期提交、`task_plan.md`、`progress.md`、`findings.md`、`package.json`、最新设计文档、插件开发文档和 dev 部署文档。
  - 当前分支 `develope` 与 `origin/develope` 对齐，工作树只有本轮规划文件改动。
  - 当前项目已经完成 `v0.1.0` dev release：具备 Streamable HTTP MCP endpoint、本地插件加载、HTTP API tool、executor workflow、环境变量凭据、策略、audit、插件 CLI、示例插件、诊断 API、MCP status resource、本地/Docker smoke 和双语 README。
  - 初步判断：下一阶段不应继续增加单一业务插件，而应围绕 MCPHub 作为 RSSHub 式中间平台的“标准化、可接入、可运营、可扩展”能力选择一个主线。
- 下一步：
  - 用户选择先实现 D：MCP 客户端接入体验，让 Agent 能实际接入 MCPHub；后续再做 A：平台标准化和开发者体验强化。
  - 下一步确认第一批目标 MCP client / Agent，再提出 2-3 种接入体验路线和推荐方案。
  - 用户确认第一批采用 C：通用 MCP client，不绑定 Claude/Cursor 等具体产品。
  - 已提出三种路线：curl 文档包、通用 MCP client CLI、通用接入包 + 最小 Agent 示例；用户确认采用方案 2：通用 MCP client CLI。
  - 已重新读取 `brainstorming` 和 `planning-with-files-zh` 技能说明，确认当前仍处于设计门槛内，不能直接进入代码实现。
  - 写入设计文档 `docs/superpowers/specs/2026-06-08-generic-mcp-client-design.md`。
  - 完成设计文档自检：无 TBD/TODO/FIXME/占位符；范围明确排除具体产品客户端配置、完整 Agent 框架、认证/OAuth、持久 session、stdio transport 和独立 npm 包发布；`git diff --check` 通过。
  - 设计提交：`97e092d Design generic MCP client CLI`。
  - 用户确认继续完成，视为设计文档通过，进入实施计划阶段。

### 阶段 24：通用 MCP client CLI 实施计划
- **状态：** complete
- **开始时间：** 2026-06-08 CST
- 执行的操作：
  - 重新读取通用 MCP client 设计文档、现有 `scripts/` 目录、plugin CLI 测试和 smoke 脚本，确认实现可自然落在 `scripts/mcp-client.ts` 与 `scripts/mcp-client/` helper 下。
  - 写入实施计划 `docs/superpowers/plans/2026-06-08-generic-mcp-client-implementation-plan.md`。
  - 实施计划拆分为 Phase 0-9：基线、package script/CLI 入口、参数解析、HTTP JSON-RPC helper、响应解析、命令 handler、输出和错误、自动化测试、文档、最终验证。
  - 完成实施计划自检：计划文档本身无 TBD/TODO/FIXME/占位符；范围明确排除具体产品客户端配置、完整 Agent 框架、认证/OAuth、持久 session、stdio transport 和独立 npm 包发布；验收标准、风险和测试策略已覆盖。
- 下一步：
  - 提交实施计划，并等待用户确认进入代码实现。

### 阶段 25：通用 MCP client CLI 实现
- **状态：** complete
- **开始时间：** 2026-06-08 CST
- 执行的操作：
  - 按 `docs/superpowers/plans/2026-06-08-generic-mcp-client-implementation-plan.md` 实现通用 MCP client CLI。
  - 新增 `pnpm mcp:client`，入口为 `scripts/mcp-client.ts`。
  - 新增 `scripts/mcp-client/common.ts`：解析 `--url`、`--json`、`--protocol-version`、`--timeout-ms`、`--uri`、`--name`、`--args`。
  - 新增 `scripts/mcp-client/client.ts`：通过真实 Streamable HTTP `/mcp` 发送 JSON-RPC，支持 JSON/SSE 解析、进程内 `Mcp-Session-Id`、请求超时和脱敏错误输出。
  - 新增 `scripts/mcp-client/commands.ts`：实现 `inspect`、`list-resources`、`read-resource`、`list-tools`、`call-tool` 和人类可读/JSON 输出。
  - 新增 `scripts/mcp-client.test.ts`，覆盖 parser、JSON/SSE 解析、HTTP 错误、429、malformed response、network failure、timeout、body stall、session header、脱敏和真实 HTTP MCPHub 集成。
  - 新增 `docs/clients/generic-mcp-client.md`，并在 `README.md` 和 `README_cn.md` 中加入通用 client 入口。
- 审查与修复：
  - spec 审查初审要求补 tool/resource not found 引导、parse error 状态/类型/body 摘要和错误路径测试；已修复并通过复审。
  - 代码质量审查初审要求支持 session header、请求 timeout、错误输出脱敏；已修复。
  - 代码质量复审指出 timeout 应覆盖 body consumption；已修复并补 headers-sent/body-never-ends 回归测试。
  - 代码质量最终复审通过。
- 验证：
  - `pnpm typecheck` 通过。
  - `pnpm lint` 通过。
  - `pnpm test` 通过，15 个测试文件、117 个测试。
  - `pnpm test:e2e` 通过。
  - `pnpm test:plugin` 通过。
  - `pnpm build` 通过。
  - `git diff --check` 通过。
  - 运行中服务验证通过：`inspect`、`list-tools`、`read-resource --uri mcphub://status`、`call-tool --name source.search --args '{}'` 均通过。
