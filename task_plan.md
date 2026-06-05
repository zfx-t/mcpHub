# 任务计划：网页到 MCP 内容工具设计

## 目标
设计一个类似 RSSHub 的工具：通过可配置路由抓取网页内容，并以适合 Agent 读取和订阅的 MCP 资源/工具形式暴露。

## 当前阶段
阶段 17：插件验证 Demo 固化

## 各阶段

### 阶段 1：上下文与需求发现
- [x] 检查当前目录和已有项目文件
- [x] 确认是否存在已有规划文件
- [x] 调研 MCP 与 RSSHub 的相关设计约束
- [x] 向用户确认产品边界和首版目标
- **状态：** complete

### 阶段 2：方案比较
- [x] 提出 2-3 种架构方案
- [x] 比较路由模型、抓取模型、MCP 暴露方式、部署复杂度
- [x] 给出推荐方案
- **状态：** complete

### 阶段 3：设计定稿
- [x] 明确核心模块、数据流、错误处理、测试策略
- [x] 与用户逐段确认设计
- [x] 得到用户批准
- **状态：** complete

### 阶段 4：设计文档
- [x] 将确认后的设计写入 docs/superpowers/specs/YYYY-MM-DD-web-to-mcp-design.md
- [x] 自检占位符、矛盾、范围和歧义
- [x] 请求用户审阅设计文档
- [x] 提交设计文档到 Git
- **状态：** complete

### 阶段 5：设计文档审阅与实施计划准备
- [x] 用户审阅 `docs/superpowers/specs/2026-06-01-web-to-mcp-design.md`
- [x] 用户确认设计无问题
- [x] 用户明确批准设计文档后，进入详细实施计划
- [x] 实施计划拆分服务端 MCP、抽取引擎、检测 API、浏览器插件、测试与部署
- [x] 在实施计划完成前不进入代码实现
- [x] 写入 `docs/superpowers/plans/2026-06-01-web-to-mcp-implementation-plan.md`
- **状态：** complete

### 阶段 6：实施计划审阅与实现启动
- [x] 用户确认实施计划和技术栈假设
- [x] 若需要调整技术栈或阶段顺序，先更新实施计划
- [x] 获准后从阶段 0 项目脚手架开始实现
- [x] 每个实现阶段完成后更新进度并运行对应校验
- **状态：** complete

### 阶段 7：最终审查与收尾
- [x] 完成实施计划 Phase 0-7 的代码与文档工作
- [x] 运行 `pnpm typecheck`
- [x] 运行 `pnpm lint`
- [x] 运行 `pnpm test`
- [x] 运行 `pnpm build`
- [x] 运行 `pnpm test:e2e`
- [x] 运行 `docker compose config`
- [x] 完成子代理规格审查和代码质量审查
- [x] 根据审查结果修复阻塞问题
- [x] 进行最终完成审计
- **状态：** complete

### 阶段 9：平台化目标重构与新设计探索
- [x] 恢复现有 Web-to-MCP 设计、实现和分支上下文
- [x] 明确当前 MVP 与用户新目标的差距：当前更偏内容抽取，不是通用 API/网站服务 MCP 适配平台
- [x] 梳理“广泛网站/服务转 MCP”的能力边界
- [x] 提出 2-3 种平台演进方案并推荐路线
- [x] 用户确认设计方向后，写入新的平台化设计文档
- [x] 自检平台化设计文档占位符、范围和歧义
- [x] 用户审阅平台化设计文档并确认没有问题
- **状态：** complete

### 阶段 10：平台化实施计划审阅
- [x] 根据平台化设计文档拆分实施阶段
- [x] 写入 `docs/superpowers/plans/2026-06-02-mcphub-platform-implementation-plan.md`
- [x] 自检实施计划覆盖 P0 验收标准、风险和测试策略
- [x] 用户审阅平台化实施计划
- [x] 用户确认后进入平台化代码实现
- **状态：** complete

### 阶段 11：平台化 P0 代码实现与验证
- [x] Phase 1：平台领域模型和 schema
- [x] Phase 2：数据库 schema、Memory/Postgres repository 扩展
- [x] Phase 3：插件 SDK、Registry、内置 Web 插件 manifest
- [x] Phase 4：API Connector，覆盖 JSON REST、auth 注入、timeout、错误和脱敏
- [x] Phase 5：环境变量凭证解析和 requirementId 绑定
- [x] Phase 6：策略引擎，覆盖 read/write/dangerous、host/method/path 限制
- [x] Phase 7：审计 logger 和审计资源数据
- [x] Phase 8：MCP Gateway 聚合插件工具和平台资源
- [x] Phase 9：样例 Admin API plugin
- [x] Phase 10：README 更新
- [x] Phase 11：全量验证、Docker Compose 复测
- **状态：** complete

### 阶段 12：本地插件加载 P1 设计
- [x] 恢复当前平台化 P0 状态和 Git 状态
- [x] 明确下一阶段主线：本地插件加载系统，不做 server-owned dangerous confirmation UI
- [x] 讨论并确认方案：通过 `MCPHUB_PLUGIN_DIR` 加载预编译 JS 插件和 `plugin.config.json`
- [x] 确认 dangerous policy：支持 `block`、`auditOnly`、`allow`，默认 `auditOnly`
- [x] 写入 `docs/superpowers/specs/2026-06-03-local-plugin-loading-design.md`
- [x] 自检设计文档占位符、范围、矛盾和歧义
- [x] 用户审阅本地插件加载设计文档
- [x] 用户确认后进入实施计划
- **状态：** complete

### 阶段 13：本地插件加载 P1 实施计划
- [x] 恢复 P0 平台实现和 P1 设计上下文
- [x] 检查现有配置、平台装配、插件 SDK、策略引擎、MCP Gateway 和 smoke 测试接缝
- [x] 写入 `docs/superpowers/plans/2026-06-03-local-plugin-loading-implementation-plan.md`
- [x] 自检实施计划覆盖配置、loader、repository、policy、MCP、audit、smoke、Docker 和文档
- [x] 用户审阅本地插件加载实施计划
- [x] 用户确认后进入代码实现
- **状态：** complete

### 阶段 14：本地插件加载 P1 实现、验证与收尾
- [x] 修复本地插件 loader，disabled 插件不再 import entrypoint
- [x] 修复 MCP gateway，工具调用只认本次启动的 registry，不再受持久化旧行影响
- [x] 修复运行时凭据/配置错误映射与失败审计
- [x] 补充回归测试，覆盖 disabled side effect、stale repository tool、credential missing
- [x] 运行 focused tests 和 typecheck
- [x] 运行全量验证：`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e`、`docker compose config`
- [x] 整理最终提交
- **状态：** complete

### 阶段 15：插件自定义执行器 P2 设计
- [x] 明确插件自定义 executor 的能力边界：单接口声明式 HTTP、插件内多步骤 workflow、复杂结果清洗和聚合
- [x] 设计插件 executor 契约：`execute(input, context)`、`context.http`、`context.credentials`、`context.config`、`context.audit/log`
- [x] 设计多步骤工具执行模型：校验、预检查、分片上传、提交、轮询、失败补偿和可恢复错误
- [x] 设计安全模型：危险操作 effect、dry-run/preflight、幂等键、审计步骤摘要、secret 不入上下文
- [x] 以 B 站上传视频插件作为目标用例，验证 executor 能覆盖多个 API 调用和复杂流程
- [x] 写入新的设计文档 `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md`
- [x] 写入实施计划 `docs/superpowers/plans/2026-06-03-plugin-executor-runtime-implementation-plan.md`
- [x] 用户审阅插件自定义执行器 P2 设计文档和实施计划
- [x] 用户确认后进入代码实现
- **状态：** complete

### 阶段 16：插件自定义执行器 P2 实现、验证与收尾
- [x] 扩展 core tool schema：工具必须二选一声明 `operation` 或 `executor`
- [x] 扩展插件 SDK：新增 `defineExecutorTool()`、handler/context 类型和 `handlers` manifest 支持
- [x] 扩展本地插件 loader：保留 runtime handler map，诊断缺失或非函数 handler
- [x] 扩展 registry/repository/Postgres：保留 executor 元数据，不持久化函数
- [x] 新增 executor runtime：handler 调用、context.config、credentials、HTTP helper、checkpoint audit、错误归一化
- [x] 扩展 MCP gateway：policy 先于 handler 执行，HTTP/executor 分流，stale repository tool 不可执行
- [x] 扩展 smoke：fake multi-step upload executor、dryRun、checkpoint audit、dangerous block
- [x] 更新 README：HTTP vs executor、示例、context API、dryRun、信任边界
- [x] 运行最终验证：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e`、`docker compose config`、`git diff --check`
- [x] 按功能拆分提交
- **状态：** complete

### 阶段 17：插件验证 Demo 固化
- [x] 固化常驻示例插件目录 `examples/plugins/fake-upload`
- [x] 新增 `pnpm test:plugin` 验证脚本
- [x] 验证脚本覆盖 MCP `tools/list`、executor tool 调用、dryRun、多步骤远端调用顺序、checkpoint audit
- [x] 更新 README，说明用户如何查看 demo 和运行验证
- **状态：** complete

## 关键问题
1. 首版目标是通用网页抽取引擎，还是面向少数高价值网站的路由系统？
2. MCP 输出应以 resources 为主、tools 为主，还是二者结合？已回答：Resources + Tools 组合。
3. 是否需要兼容 RSS 输出，或只做 MCP/Agent 原生格式？
4. 浏览器插件首版只做页面检测/采样，还是也直接执行抓取并回传内容？已修正：只发送网站信息给服务器并展示服务端结果，不标注、不抓取。
5. 部署形态是本地优先、云端服务，还是混合？已回答：服务端部署，可自部署或公开服务。

## 已做决策
| 决策 | 理由 |
|------|------|
| 先设计，不实现 | brainstorming 技能要求设计获批前不得实现 |
| 使用本地规划文件跟踪 | planning-with-files-zh 要求复杂任务使用 task_plan.md、findings.md、progress.md |
| 采用混合模式 | 用户选择通用抽取 + 专用路由，并加入浏览器插件判断当前网站是否有 MCP 可用 |
| 插件不负责标注或抓取 | 用户要求插件只发送网站信息给服务器并展示结果 |
| MCP 使用 Resources + Tools | 用户选择组合模式 |
| 服务端部署 MCP | 用户希望 MCP 服务部署在服务器，可自部署或使用公开服务 |
| 推荐架构采用服务端 MCP + 混合抽取 + 插件检测入口 | 用户已确认并修正插件边界 |
| 内部数据模型采用 Source、Rule、Document、FeedItem | 用户已确认 |
| MCP 首版接口聚焦读取、刷新、预览和诊断 | 插件职责收窄后，rule.validate 后置 |
| 设计文档已提交 | Git 提交为 `8dc3a68 Add web-to-mcp design` |
| 设计文档已获用户批准 | 用户审阅后确认没有问题 |
| 实施计划已写入 | `docs/superpowers/plans/2026-06-01-web-to-mcp-implementation-plan.md` |
| MVP 实现已完成本地验证 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 均通过 |
| Docker Compose 端到端验证已通过 | server + postgres 启动成功；health、detector API、MCP resources、`source.refresh`、item read、`debug.explain` 均通过 |
| 新目标升级为通用 MCPHub 平台 | 用户希望不仅支持网页内容抽取，还能让不支持 MCP 的网站/服务通过平台插件、适配器或自定义代码广泛变成 MCP 可用 |
| 平台化路线已确认 | 用户确认采用“分层通用平台，P0 先做 REST/API 插件适配，同时保留 Web 内容插件” |
| 平台化设计文档已写入 | `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md` |
| 平台化设计文档已获用户批准 | 用户审阅后确认没有问题，可以继续 |
| 平台化实施计划已写入 | `docs/superpowers/plans/2026-06-02-mcphub-platform-implementation-plan.md` |
| 平台化 P0 核心代码已实现 | 新增插件 SDK、API Connector、Credential Store、Policy、Audit、MCP 聚合和样例 Admin API 插件 |
| 平台化 P0 端到端验证已完成 | 本地 smoke 和 Docker Compose plugin smoke 均覆盖 sample admin read/dangerous/audit |
| 本地插件加载 P1 方向已确认 | 用户确认不优先做危险操作确认 UI，下一阶段做本地插件加载，并将 dangerous policy 改为可配置 |
| 本地插件加载 P1 设计文档已获批 | 用户确认设计文档没有问题，并要求继续进入实施计划 |
| 本地插件加载 P1 实施计划已写入 | `docs/superpowers/plans/2026-06-03-local-plugin-loading-implementation-plan.md` |
| 插件自定义执行器进入后续 P2 | 用户确认第二版重点是插件自定义 executor，可支撑 B 站上传视频这类多 API、多步骤 workflow tool |
| 插件自定义执行器设计和实施计划已写入 | `docs/superpowers/specs/2026-06-03-plugin-executor-runtime-design.md` 和 `docs/superpowers/plans/2026-06-03-plugin-executor-runtime-implementation-plan.md` |
| 插件自定义执行器 P2 已实现并验证通过 | 支持 `executor: { type: "module", handler }`、本地 handler 加载、gateway 执行、checkpoint audit、fake upload smoke |
| 插件验证 Demo 已固化 | `examples/plugins/fake-upload` 可直接查看代码，`pnpm test:plugin` 可验证 MCPHub 正确加载并执行插件 |

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 当前目录不是可用 Git 仓库，git log 失败 | 1 | 记录为环境约束；设计阶段继续推进 |
| 当前 .git 是空目录，git status 失败 | 1 | 无法提交设计文档；记录限制并交付文件 |
| 沙箱内 .git 是只读挂载，普通 git init 失败 | 1 | 使用提升权限完成真实仓库初始化，分支为 main |
| `docker build -t mcphub:dev .` 拉取基础镜像超时 | 2 | 后续网络恢复后完成构建；发现并修复 Dockerfile 中 `corepack` 缺失问题 |
| Docker server 启动后 seed 写入 JSONB 失败 | 1 | `pg` 参数写入 JSONB 前统一 `JSON.stringify` |
| Docker `source.refresh` 对旧 seed URL 返回 404 | 1 | 将示例刷新 URL 改为 `https://example.com/`，并增加 custom route 正文 fallback |
| API tool 的 method/path 被 Zod 剥离 | 1 | 将 HTTP operation 提升为 core schema 的 durable `PluginTool.operation` |
| Docker runtime 找不到平台 workspace 包 | 1 | 将 `@mcphub/audit`、`@mcphub/credentials`、`@mcphub/plugins` 加入 `apps/server` runtime dependencies |
| SDK MCP transport 会丢弃平台工具参数 | 1 | 将插件 JSON Schema 转成 Zod shape 注册到 SDK tool，保留 `id/page/query` 等参数 |

## 备注
- 外部网页和规范内容只写入 findings.md，不写入 task_plan.md。
- 当前已进入实现与验证阶段；Docker Compose 端到端验证已完成。
