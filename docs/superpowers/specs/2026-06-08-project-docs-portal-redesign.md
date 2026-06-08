# MCPHub Project Docs Portal Redesign

Date: 2026-06-08

## Background

The current `apps/web` homepage proves that MCPHub can be deployed to GitHub Pages, but the page still reads like a thin landing page. It does not sufficiently explain the project, does not provide a documentation center, and does not make the "RSSHub-style MCP middleware platform" positioning obvious enough for a new developer.

This redesign changes the homepage from a sparse marketing-style page into a project portal and documentation entry point.

## Goal

Build a clearer first page for MCPHub that helps three audiences:

- Agent users understand what MCPHub can expose through `/mcp`.
- Plugin developers understand how to create, verify, and run local plugins.
- Backend/API maintainers understand why MCPHub can adapt existing REST APIs and admin systems without modifying the upstream system.

The page should make MCPHub feel like a usable open-source middleware project, not a single demo plugin.

## Product Message

Primary positioning:

```text
MCPHub is an RSSHub-style MCP middleware platform.
It turns existing APIs, websites, and trusted local workflows into MCP resources and tools.
```

The page must explain:

- MCPHub does not replace an existing website, backend, or admin panel.
- MCPHub runs as an adapter layer between upstream systems and Agent clients.
- Developers extend MCPHub by writing local plugins.
- Agents consume the result through standard MCP resources and tools.
- Current dev builds already include plugin loading, executor workflows, policy, audit, diagnostics, and generic MCP client verification.

The page must avoid implying that MCPHub already has a public plugin marketplace, hosted SaaS, full OpenAPI generation, or production authentication.

## Information Architecture

### 1. Header

Use a sticky but compact header with clear navigation:

- Overview
- Docs
- Architecture
- MCP Surface
- Roadmap
- GitHub

The header should include the product name and a small project status label such as `dev platform`.

### 2. Hero

The hero must solve the first 10 seconds:

- Large product name: `MCPHub`
- Direct explanation in Chinese.
- One sentence RSSHub analogy.
- Primary CTA: read quick start.
- Secondary CTA: view GitHub repository or plugin guide.
- A compact architecture visual showing:

```text
Existing API / Website / Local Plugin
              |
            MCPHub
  credentials + policy + audit
              |
      MCP resources + tools
              |
            Agent
```

The hero should not occupy the whole viewport. The next section should be visible on desktop and mobile so the page feels information-rich rather than empty.

### 3. About

Add a real project introduction section with three explanations:

- Why MCPHub exists: many useful systems expose REST APIs or web workflows but not MCP.
- What MCPHub is: a self-hostable middleware service and plugin runtime.
- What MCPHub is not: not a crawler-only project, not a single Bilibili/admin plugin, not a replacement for upstream authorization.

This section should answer the user's previous feasibility concern: the project is meaningful because it converts one-off API instructions into reusable, inspectable MCP interfaces.

### 4. Documentation Center

Add a visible documentation hub. Each item links to an existing repository document:

- Quick Start: `README_cn.md`
- Plugin Development: `docs/plugins/development.md`
- Plugin Standard: `docs/plugins/standard.md`
- Generic MCP Client: `docs/clients/generic-mcp-client.md`
- Dev Deployment: `docs/deployment/dev.md`
- Diagnostics: `docs/operations/diagnostics.md`

Each documentation item should include a short description, not just a raw link.

### 5. Architecture

Show the system as a platform:

```text
apps/server
  -> Fastify HTTP API
  -> Streamable HTTP /mcp

packages/plugins
  -> local loader
  -> plugin standard validation

packages/mcp
  -> gateway
  -> SDK server
  -> executor runtime

packages/policy + packages/audit + packages/credentials
  -> controlled execution context
```

The page does not need to expose every package, but it should explain the relationship between plugin code, MCPHub runtime, and Agent calls.

### 6. Quick Start

Add a practical quick-start block with commands:

```bash
pnpm install
REQUEST_LOGGING=false pnpm dev
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
pnpm plugin:create my-admin --template http-api --tool-name my.admin.users.list
pnpm plugin:verify examples/plugins/my-admin
```

The command panel should support copy buttons, but the text must remain useful if JavaScript fails.

### 7. MCP Surface

Add a dedicated section that lists the exposed MCP/API surface.

MCP endpoint:

- `/mcp`

MCP methods:

- `initialize`
- `resources/list`
- `resources/read`
- `tools/list`
- `tools/call`

Platform resources:

- `mcphub://status`
- `mcphub://plugins`
- `mcphub://plugins/{pluginId}`
- `mcphub://plugins/{pluginId}/tools`
- `mcphub://audit/recent`

HTTP diagnostics:

- `/healthz`
- `/api/status`
- `/api/plugins`

This section should be compact and reference-style, so a developer can scan it quickly.

### 8. Plugin System

Explain the two plugin execution modes:

- HTTP operation tools for one-request REST API operations.
- Executor tools for multi-step business workflows such as validation, upload, submit, poll, and result cleanup.

Show a small directory tree:

```text
examples/plugins/my-plugin/
|-- index.js
|-- plugin.config.json
|-- README.md
```

Show a short manifest snippet with `mcphub.minVersion`, `capabilities`, `tools`, and either `operation` or `executor`.

### 9. Current Progress

Replace vague roadmap copy with honest project status:

Available now:

- Streamable HTTP MCP endpoint.
- Web content resources and tools.
- Local plugin loading.
- HTTP operation tools.
- Executor workflow tools.
- Credential, policy, and audit support.
- Plugin standard validation.
- Generic MCP client CLI.
- Dev deployment and diagnostics docs.
- GitHub Pages project homepage.

Next development priorities:

- API/OpenAPI document import to generate editable MCPHub plugin skeletons.
- Better plugin lifecycle diagnostics.
- Deployment hardening and production exposure guidance.
- A richer docs experience when the project outgrows a single-page portal.

### 10. Footer

The footer should repeat the most useful links:

- GitHub repository
- README
- Chinese README
- Plugin guide
- MCP client guide

## Visual Direction

Use a documentation-first developer portal style:

- Light background for readability.
- Dense but organized sections.
- Clear headings, tables, and code panels.
- Restrained blue accent for protocol links and CTAs.
- Green used only for status/verified signals.
- Avoid decorative gradient orbs, empty hero decoration, oversized marketing copy, or a one-note dark terminal page.

Recommended tokens:

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#F8FAFC` | Page background |
| `--surface` | `#FFFFFF` | Repeated cards and panels |
| `--text` | `#1E293B` | Main text |
| `--muted` | `#64748B` | Secondary text |
| `--border` | `#E2E8F0` | Dividers and section boundaries |
| `--accent` | `#2563EB` | Links and primary actions |
| `--success` | `#16A34A` | Status indicators |
| `--panel` | `#111827` | Code and architecture panels |

Use system sans-serif and system monospace stacks. Do not add external fonts for this redesign.

## Interaction And Accessibility

The page remains static and should degrade cleanly:

- All core content must be readable without JavaScript.
- Copy buttons are progressive enhancement only.
- Navigation anchors must have visible focus states.
- Touch targets should be at least 44px tall.
- Sticky header must not hide anchored content.
- No horizontal page scroll at 320px, 375px, 768px, 1024px, or 1440px.
- Respect `prefers-reduced-motion`.
- Use semantic landmarks and one `h1`.

## Implementation Scope

Change only the independent homepage app and docs/planning files:

- `apps/web/index.html`
- `apps/web/src/styles.css`
- `apps/web/src/main.ts` if needed for copy buttons and active navigation
- planning/progress/design docs

Do not change MCP server runtime behavior, plugin loader behavior, package APIs, or GitHub Pages workflow as part of this redesign.

## Verification

The implementation plan should require:

- `pnpm --filter @mcphub/web typecheck`
- `pnpm --filter @mcphub/web build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm build`
- `git diff --check`
- Browser inspection through Vite dev server.
- Responsive checks at 320px, 375px, 768px, 1024px, and 1440px.
- Visual inspection for no text overlap, no horizontal scroll, readable code panels, and visible documentation links.

## Acceptance Criteria

- The homepage clearly includes project introduction, about content, documentation entry points, architecture, quick start, MCP surface, plugin model, and roadmap.
- A new developer can identify where to read plugin docs and how to verify `/mcp`.
- A backend/API maintainer can understand how MCPHub adapts an existing API without modifying it.
- The page looks like an open-source developer portal rather than a sparse marketing landing page.
- The redesign remains a static Vite page and does not affect MCPHub runtime behavior.
