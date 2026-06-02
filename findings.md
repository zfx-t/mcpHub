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
- 用户进一步澄清长期目标：MCPHub 不应只做网页内容抽取，而应成为通用 MCP 中间件平台，让不支持 MCP 的网站服务、管理后台、REST API、网页功能和自定义代码插件都能被适配成 AI 可使用的 MCP Resources/Tools。
- 用户给出的关键用例：已有管理后台网站和 RESTful API 文档，不修改原系统，通过 MCPHub 中自己编辑的插件代码，把后台管理能力暴露成 MCP 接口给 AI 使用。

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
| 当前 MVP 与新目标存在范围差距 | 现有实现偏 Web 内容抽取与缓存，已具备 MCP Gateway/Tools/Resources/存储/Docker 底座，但缺少通用插件运行时、API-to-MCP 适配、鉴权、权限策略、审计和危险操作确认 |
| 平台化方向已获用户确认 | 用户确认继续采用“分层通用平台，P0 REST/API 插件适配 + 保留 Web 内容插件”路线 |
| 平台化设计文档已落盘 | `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md` 定义平台目标、插件模型、API-to-MCP 映射、凭据、策略、审计、迁移和验收标准 |

## 平台化演进草案

### 新目标抽象
MCPHub 应从单一 Web 内容抽取服务升级为通用 MCP 适配平台。平台核心职责不是替代原网站或后台服务，而是在不修改原系统的前提下，通过插件、适配器和配置，把现有网站服务能力转换为 AI 可发现、可校验、可审计调用的 MCP Resources 和 Tools。

### 能力边界
| 能力 | 说明 | 优先级建议 |
|------|------|------------|
| REST/OpenAPI to MCP | 将已有 REST API、OpenAPI/Swagger/Postman 文档或手写插件映射成 MCP Tools | P0 |
| Web Content to MCP | 保留现有网页内容抽取、缓存、刷新、诊断能力 | P0 |
| Plugin Runtime | 支持用户编写插件注册 tools/resources、配置鉴权、执行请求 | P0 |
| Credential 管理 | 保存 API token、cookie、basic auth、headers、环境变量引用 | P0 |
| 权限与安全策略 | 区分只读/写入/危险操作，支持二次确认、禁用、scope 限制 | P0 |
| 审计日志 | 记录 AI 调用了哪个 tool、参数摘要、目标服务、结果、错误 | P0 |
| 网页自动化适配 | 对无 API 的网站通过浏览器自动化执行操作 | P2，风险和复杂度高 |
| 公共插件市场 | 分享和审核第三方适配器 | P2，需先有安全模型 |

### 三种可选架构
| 方案 | 内容 | 优点 | 代价 |
|------|------|------|------|
| API-first 插件平台 | 先做 REST/OpenAPI + 自定义代码插件，把后台接口映射为 MCP Tools | 最贴合管理后台用例，安全边界清晰，易测试 | 暂不能覆盖无 API 网站操作 |
| Web-first 广覆盖平台 | 继续强化网页抽取和浏览器插件，尽量覆盖普通网站内容 | 延续现有 MVP，变化小 | 不足以支撑后台管理类操作 |
| 分层通用平台 | 统一 Plugin Runtime，第一层 REST/API 插件，第二层 Web 内容插件，第三层网页自动化插件 | 长期最符合“广泛不支持 MCP 服务转 MCP”目标 | 设计工作更重，需要明确 P0/P1/P2 |

### 推荐路线
推荐采用“分层通用平台”，但 P0 只实现 API-first 插件能力和保留现有 Web 内容能力。这样既不丢掉当前 MVP，又能立刻覆盖用户的管理后台/REST API 用例。网页自动化应推迟到安全策略、审计和人工确认机制成熟后再做。

### 建议的 P0 平台模块
| 模块 | 职责 |
|------|------|
| Plugin Registry | 管理插件元信息、启用状态、版本、实例配置 |
| Plugin Runtime | 加载插件，注册 MCP tools/resources，隔离插件调用上下文 |
| API Connector | 执行 REST 请求，处理 baseUrl、headers、query、body、timeout、错误 |
| Auth/Credential Store | 管理 token、api key、cookie、basic auth、环境变量引用 |
| Tool Policy Engine | 给 tool 标注 read/write/dangerous，控制是否允许 AI 直接调用 |
| Audit Log | 记录 tool 调用、参数摘要、调用者、状态码、耗时和错误 |
| Admin/API Plugin SDK | 让用户用代码定义后台 API 到 MCP tool 的映射 |

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
