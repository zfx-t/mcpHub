# MCPHub Independent Homepage Design

Date: 2026-06-08

Parent context:
- `docs/superpowers/specs/2026-06-02-mcphub-platform-design.md`
- `docs/superpowers/specs/2026-06-07-dev-release-readiness-design.md`
- `docs/superpowers/specs/2026-06-08-generic-mcp-client-design.md`
- `docs/superpowers/specs/2026-06-08-platform-standardization-design.md`

## Goal

Create an independent project homepage that introduces MCPHub as a developer-facing MCP middleware platform.

The page should help a new visitor understand three things quickly:

1. MCPHub converts existing websites, REST APIs, and custom workflows into Agent-callable MCP tools.
2. MCPHub is a platform and plugin standard, not a single business plugin or a replacement for the upstream service.
3. The current dev version already has a usable plugin, verification, diagnostics, and MCP client workflow.

The homepage should live as a separate web application under `apps/web`, so it can be built and deployed independently from the Fastify MCP/API server.

## Product Positioning

The page positions MCPHub as:

```text
REST API / Web / Custom Plugin -> MCPHub -> MCP Resources + Tools -> Agent
```

The closest mental model is RSSHub, but for MCP-capable Agent tools. Developers write adapters or generate plugin skeletons. MCPHub handles plugin loading, credentials, policy, audit, diagnostics, and MCP exposure.

The page should avoid implying that MCPHub already includes a public plugin marketplace, production-grade authentication, full OpenAPI generation, or a hosted cloud service.

## Recommended Implementation Shape

Create a new workspace app:

```text
apps/web/
|-- index.html
|-- package.json
|-- tsconfig.json
|-- vite.config.ts
|-- src/
    |-- main.ts
    |-- styles.css
```

Use Vite, TypeScript, semantic HTML, and plain CSS. Do not add React for this first homepage. The page is mostly static, and plain web primitives keep the bundle small, easy to audit, and easy to deploy.

Add package scripts:

```json
{
  "build": "vite build",
  "dev": "vite --host 127.0.0.1",
  "typecheck": "tsc -p tsconfig.json --noEmit"
}
```

Root scripts can be added later if useful, but the first implementation can be run through:

```bash
pnpm --filter @mcphub/web dev
pnpm --filter @mcphub/web build
pnpm --filter @mcphub/web typecheck
```

## Visual Direction

Use a restrained developer-platform landing style:

- Swiss-modern grid layout.
- Light documentation-like base for readability and trust.
- Dark terminal/product panels for MCP flow and CLI examples.
- Small green status accents for connected, verified, and running states.
- Blue accents for protocol/platform concepts.
- No decorative gradient orbs, emoji icons, or dense marketing ornamentation.

Recommended tokens:

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#f8fafc` | Page background |
| `--surface` | `#ffffff` | Section surfaces and repeated items |
| `--text` | `#0f172a` | Primary text |
| `--muted` | `#526070` | Secondary text |
| `--border` | `#dbe3ec` | Borders and dividers |
| `--panel` | `#0f172a` | Dark code/product panels |
| `--panel-muted` | `#94a3b8` | Muted text on dark panels |
| `--accent` | `#16a34a` | Verified/running CTA accent |
| `--protocol` | `#0369a1` | Protocol/platform accent |
| `--danger` | `#dc2626` | Dangerous/policy indicators |

Typography:

- Body: system sans-serif stack for fast loading and native rendering.
- Code and command snippets: system monospace stack.
- No external font dependency in the first implementation.
- Base body font size is 16px or larger.
- Long paragraphs keep a readable line length.

## Information Architecture

### 1. Hero

Purpose: explain the platform in one viewport.

Content:

- Product name: `MCPHub`
- Primary statement: `Turn existing APIs, websites, and workflows into Agent-callable MCP tools.`
- Supporting copy in Chinese or bilingual-friendly plain wording.
- Primary CTA: `Start with the plugin guide`
- Secondary CTA: `View the fake-upload example`
- Product visual: a dark flow panel showing:

```text
REST API       Web Source       Local Plugin
     \              |              /
              MCPHub
      credentials + policy + audit
                 |
          MCP Resources + Tools
                 |
               Agent
```

The visual should be readable, not decorative. On mobile it stacks below the hero copy.

### 2. Platform Positioning

Purpose: remove confusion about what MCPHub is.

Use three concise columns:

- `Not a single plugin`: MCPHub is a platform for many adapters.
- `Not a replacement backend`: upstream services keep their own APIs and rules.
- `A middleware standard`: MCPHub maps external capabilities into MCP resources/tools.

### 3. Core Capabilities

Purpose: show current v0.1/dev capabilities.

Use a compact responsive grid with short descriptions:

- Local plugin loading.
- HTTP API tools.
- Custom executor workflows.
- Credentials, policy, and audit.
- Plugin standard and verifier.
- Streamable HTTP MCP endpoint.
- Generic MCP client CLI.
- Dev diagnostics and status resources.

Each item should be scannable and avoid long explanation blocks.

### 4. Workflow

Purpose: give a developer a clear first path.

Show four numbered steps with commands:

```bash
pnpm plugin:create my-admin --template http-api --tool-name admin.users.list
pnpm plugin:verify examples/plugins/my-admin
MCPHUB_PLUGIN_DIR=examples/plugins pnpm dev
pnpm mcp:client --url http://127.0.0.1:3000/mcp list-tools
```

Use a dark command panel and short labels. On small screens, commands wrap safely and stay readable.

### 5. Plugin Model

Purpose: show platform/plugin decoupling.

Display:

```text
examples/plugins/my-plugin/
|-- index.js
|-- plugin.config.json
|-- README.md
```

Pair it with a minimal manifest snippet that shows:

- `mcphub.minVersion`
- `mcphub.capabilities`
- `tools`
- `operation` or `executor`

The code snippet should be short enough to fit without horizontal layout breakage.

### 6. Current Status And Roadmap

Purpose: explain project maturity honestly.

Include two columns:

- `Available now`: dev server, local plugins, executor workflow, plugin verification, diagnostics, MCP client.
- `Next`: OpenAPI/API docs to MCPHub plugin generator, richer lifecycle diagnostics, deployment hardening.

Avoid promising a hosted service, plugin marketplace, or complete OpenAPI support as already finished.

### 7. Final CTA

Purpose: send users to concrete next actions.

Recommended links:

- README.
- Chinese README.
- Plugin development guide.
- Plugin standard.
- Fake upload example.

Use text links or button-style anchors with visible focus states.

## Interaction And Accessibility

The homepage is static, but it still needs polished interaction:

- All anchors and buttons must have visible focus states.
- Touch targets should be at least 44px tall.
- Hover and focus transitions should be 150-250ms.
- Respect `prefers-reduced-motion`.
- Do not depend on hover-only content.
- Maintain color contrast for text and code panels.
- Use semantic landmarks: `header`, `main`, `section`, `footer`.
- Use a single `h1`; sections use sequential headings.
- No horizontal page scroll at 375px width.

## Responsive Behavior

Breakpoints:

- `375px`: single-column layout, hero visual below copy, command snippets wrap.
- `768px`: two-column hero allowed, capability grid becomes two columns.
- `1024px+`: constrained max-width layout, hero and product visual align side by side.
- `1440px`: content remains centered and readable, not stretched edge to edge.

The page should reserve stable dimensions for visual panels and code blocks so hover states do not shift layout.

## Data Flow

There is no runtime API dependency in the first homepage.

All displayed content is static text, code snippets, and internal repository links. Future versions may read `/api/status`, but that is intentionally out of scope for this first independent website.

## Error Handling

Because the first homepage is static, error handling focuses on graceful degradation:

- If JavaScript fails, the page content remains readable.
- Internal links should point to real repository paths where possible.
- Code snippets are plain text and do not require client-side highlighting.
- CSS should not hide core content while loading.

## Testing And Verification

Implementation should be verified with:

- `pnpm --filter @mcphub/web typecheck`
- `pnpm --filter @mcphub/web build`
- `pnpm lint`
- Browser check through the Vite dev server.
- Responsive checks at 375px, 768px, 1024px, and 1440px.
- Visual inspection for no text overlap, no horizontal scroll, readable code panels, and visible focus states.

If Playwright or another browser automation setup is already available later, add screenshot checks. Do not introduce a new browser test framework just for this first static homepage unless implementation risk grows.

## Out Of Scope

This design does not include:

- A product dashboard.
- Live `/api/status` integration.
- Plugin marketplace browsing.
- User login or hosted service onboarding.
- Animated 3D scenes or video demos.
- React component architecture.
- Docs site routing.
- Full English/Chinese language switcher.

## Acceptance Criteria

- `apps/web` exists as an independent workspace app.
- The homepage clearly explains MCPHub's platform positioning.
- The page shows current project capabilities and developer workflow.
- The design is responsive and readable on mobile and desktop.
- The page can be built independently with Vite.
- The implementation does not affect MCP server runtime behavior.
