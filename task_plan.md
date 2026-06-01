# 任务计划：网页到 MCP 内容工具设计

## 目标
设计一个类似 RSSHub 的工具：通过可配置路由抓取网页内容，并以适合 Agent 读取和订阅的 MCP 资源/工具形式暴露。

## 当前阶段
全部完成

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

## 遇到的错误
| 错误 | 尝试次数 | 解决方案 |
|------|---------|---------|
| 当前目录不是可用 Git 仓库，git log 失败 | 1 | 记录为环境约束；设计阶段继续推进 |
| 当前 .git 是空目录，git status 失败 | 1 | 无法提交设计文档；记录限制并交付文件 |
| 沙箱内 .git 是只读挂载，普通 git init 失败 | 1 | 使用提升权限完成真实仓库初始化，分支为 main |
| `docker build -t mcphub:dev .` 拉取基础镜像超时 | 2 | 记录为 Docker Hub 网络限制；已用 `docker compose config` 验证 compose 结构 |

## 备注
- 外部网页和规范内容只写入 findings.md，不写入 task_plan.md。
- 当前任务范围是“分析与设计计划”，不进行代码实现。
