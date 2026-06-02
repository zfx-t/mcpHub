# 发现与决策

## 需求
- 用户希望设计一个类似 RSSHub 的工具。
- 核心目标是把网页端抓取结果转换为适合 Agent 读取的 MCP 形式。
- 用户要求进行分析并设计计划，而不是立即实现。
- 用户选择混合模式：通用网页抽取 + 专用网站路由。
- 用户希望结合浏览器插件，用于判断当前网站是否已有或能够生成 MCP 可读内容。
- 用户进一步收窄插件职责：插件不负责标注、不负责抓取，只把网站等信息发送给服务器，并展示服务端返回结果。
- 用户选择 MCP 暴露方式为 Resources + Tools 组合。
- 用户选择部署形态为服务端部署：可由用户自部署，也可使用公开网络服务，并由用户配置到 Agent。

## 项目上下文发现
- 工作目录：`/home/zfxt/formyself/mcpHub`
- 目录当前以设计与规划文件为主，包含 `task_plan.md`、`findings.md`、`progress.md` 和 `docs/superpowers/specs/2026-06-01-web-to-mcp-design.md`。
- Git 仓库已初始化，当前分支为 `main`，并跟踪 `origin/main`。
- 最新提交为 `8dc3a68 Add web-to-mcp design`。
- 未发现 README、package.json、pyproject.toml、Cargo.toml 或 go.mod。

## 研究发现
- MCP 官方规范当前最新版本为 `2025-11-25`。官方仓库说明该仓库包含 MCP specification、protocol schema 和官方文档；GitHub release 显示最新 release 为 2025-11-25。
- MCP 基础协议使用 JSON-RPC 2.0，服务端能力包括 Resources、Prompts、Tools；实现必须支持基础协议和生命周期管理，其他组件按需求实现。
- MCP Resources 用于向客户端暴露可读取上下文数据，每个资源由 URI 唯一标识；支持 `resources/list`、`resources/read`、资源模板、可选订阅和 listChanged 通知。
- MCP Resource 数据结构适合表达网页抽取后的内容：`uri`、`name`、`title`、`description`、`mimeType`、`size`、`annotations` 等。
- MCP Tools 由模型发现和调用，适合提供“fetch_route / search / refresh / inspect_source”等有参数、有副作用或需实时执行的能力；工具参数使用 JSON Schema。
- MCP 标准传输包括 stdio 和 Streamable HTTP。Streamable HTTP 适合长驻服务和多客户端；stdio 适合本地 Agent 客户端快速接入。
- RSSHub 的核心启发是“路由 + handler + 标准数据结构 + 输出中间件”：路由 handler 抽取 channel title/link 和 item title/link/description/pubDate 等字段，中间件负责格式化输出。
- RSSHub 调试机制包含 `format=debug.json` 与 item 级 debug HTML，说明开发体验需要可检查抽取中间结果。
- 浏览器扩展方面，官方 Chrome/MDN 文档确认内容脚本主要通过消息系统与 extension service worker/background 通信；Native Messaging 不能直接在 content script 使用，需要经 extension 页面或 service worker 中转。
- 浏览器插件若只做网站 MCP 可用性检测，最稳妥路径是读取当前 URL、站点元信息、页面标题、canonical URL 和少量公开元标签，发送给服务端查询；服务端返回是否已有 Source/Rule、是否可添加到 Agent、是否需要等待支持。

## 技术决策
| 决策 | 理由 |
|------|------|
| 暂不选择具体技术栈 | 需先确认首版目标和部署方式 |
| 暂不创建代码结构 | 设计未获用户批准 |
| 产品形态采用混合模式 | 同时满足覆盖率和高质量抽取，复杂网站可用专用路由兜底 |
| 浏览器插件只做网站 MCP 可用性检测 | 用户明确要求插件不标注、不抓取，只发送网站信息给服务器并展示结果 |
| MCP 暴露采用 Resources + Tools 组合 | Resources 适合稳定可读内容，Tools 适合刷新、搜索、调试和规则生成 |
| MCP 服务部署在服务器 | 用户明确希望支持自部署和公开网络服务，供用户自行配置到 Agent |
| 推荐架构已确认 | 服务端 MCP + 混合抽取引擎 + 浏览器插件检测入口 |
| 四层数据模型已确认 | Source、Rule、Document、FeedItem 分离，便于抓取、规则、内容和 MCP 映射独立演进 |
| MCP 接口范围已确认 | 首版包括 sources、source items、item read、source.search、source.refresh、extract.preview、debug.explain；rule.validate、rule.publish 和公共审核流后置 |
| 插件正式定位为 MCPHub detector | 用户确认修正版插件设计：只查询服务器并展示 MCP 可用性 |
| 服务端流程和错误模型已确认 | 插件查询链路、Agent/MCP 读取链路、抓取优先级和诊断错误码已得到用户认可 |
| 设计文档已落盘并提交 | `docs/superpowers/specs/2026-06-01-web-to-mcp-design.md` 已写入并由提交 `8dc3a68` 记录 |
| 设计文档已获批 | 用户审阅后确认没有问题，可以继续后续工作 |

## 实施计划建议
| 建议 | 理由 |
|------|------|
| TypeScript monorepo | 同时覆盖 Node 服务端、共享 schema、MCP SDK 集成和浏览器扩展 |
| `pnpm` workspaces | 适合多包仓库，能明确 apps 与 packages 边界 |
| PostgreSQL 作为生产数据库目标 | 服务端部署和公开实例更适合稳定关系型存储 |
| Browser extension 使用 Manifest V3 | Chrome 现代扩展默认形态，符合 detector 插件边界 |
| 先做检测 API，再做 MCP gateway 和扩展 UI | 先稳定 Source 匹配和服务端契约，降低后续 UI 返工 |

## 遇到的问题
| 问题 | 解决方案 |
|------|---------|
| 当前目录没有可参考的现有实现 | 将从目标架构开始设计 |
| 规划文件状态落后于 Git 实际状态 | 已将阶段 4 更新为完成，并把当前阶段推进到设计审阅门槛 |
| 当前尚未确认实施计划技术栈假设 | 在进入代码实现前请用户确认或提出调整 |
| Docker build 网络限制已复测通过 | 后续完成 `docker compose up --build -d server`，server 与 postgres 均启动成功 |

## 实现发现
| 发现 | 证据 |
|------|------|
| 本地验证通过 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 通过 |
| Compose 结构有效 | `docker compose config` 输出包含 `server` 和 `postgres` 服务 |
| 端到端 smoke 使用真实 HTTP server | `scripts/smoke.ts` 启动 Fastify server 并通过 HTTP 调用 detect API 与 MCP endpoint |
| MCP gateway 使用官方 SDK transport | `apps/server/src/app.ts` 使用 `StreamableHTTPServerTransport`，`packages/mcp/src/sdk-server.ts` 使用 `McpServer` |
| 最终验证通过 | `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e` 最终重跑均通过 |
| Docker Compose 端到端验证通过 | `/healthz`、`/api/detect-site`、MCP `resources/list`、`source.refresh`、item `resources/read`、`debug.explain` 均通过 |
| PostgreSQL JSONB 写入需要显式序列化 | `pg` 直接传数组/对象到 JSONB 时触发 `invalid input syntax for type json`，已在 `PostgresRepository` 中统一处理 |

## 资源
- MCP 官方仓库：https://github.com/modelcontextprotocol/modelcontextprotocol
- MCP 最新基础协议：https://modelcontextprotocol.io/specification/2025-11-25/basic/index
- MCP Resources：https://modelcontextprotocol.io/specification/2025-11-25/server/resources
- MCP Tools：https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP Transports：https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- RSSHub 创建路由文档搜索摘要：https://docs.rsshub.app/joinus/new-rss/start-code
- RSSHub 调试文档搜索摘要：https://docs.rsshub.app/joinus/advanced/debug
- Chrome extension message passing：https://developer.chrome.com/docs/extensions/mv3/messaging
- Chrome extension native messaging：https://developer.chrome.com/docs/extensions/mv3/nativeMessaging
- MDN WebExtensions content scripts：https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
- MDN WebExtensions native messaging：https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging

## 视觉/浏览器发现
- 浏览器未用于视觉分析，仅用于读取官方/文档资料。

---
*每执行2次查看/浏览器/搜索操作后更新此文件*
*防止视觉信息丢失*
