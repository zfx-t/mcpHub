# MCPHub Project Docs Portal Redesign Implementation Plan

Date: 2026-06-08
Design: `docs/superpowers/specs/2026-06-08-project-docs-portal-redesign.md`

## Objective

Redesign the existing `apps/web` homepage into a project documentation portal.

The result should clearly introduce MCPHub, explain its RSSHub-style middleware positioning, expose documentation entry points, show architecture and MCP interface surfaces, and guide developers toward plugin creation and `/mcp` verification.

This implementation must stay limited to the static web app and planning docs. It must not change MCPHub server runtime behavior, plugin loader behavior, package APIs, or GitHub Pages workflow behavior.

## Scope

Included:

- Replace the current sparse landing page content in `apps/web/index.html`.
- Rework `apps/web/src/styles.css` into a documentation-portal visual system.
- Keep or simplify `apps/web/src/main.ts` progressive enhancements.
- Preserve the existing Vite + TypeScript + plain HTML/CSS stack.
- Keep the existing `apps/web` workspace package and GitHub Pages deployment path.
- Validate desktop and mobile layouts through Vite.

Excluded:

- React or another UI framework.
- Full docs router or multi-page documentation site.
- Live `/api/status` integration.
- Authentication, dashboard, plugin management UI, or marketplace UI.
- Changes to `.github/workflows/pages.yml`.
- Changes to `apps/server`, `packages/mcp`, `packages/plugins`, or runtime package APIs.
- Hosted SaaS copy, public plugin marketplace promises, or complete OpenAPI import promises as finished features.

## Phase 0: Baseline And Worktree Protection

Actions:

- Confirm current branch and worktree state with `git status --short --branch`.
- Confirm `apps/web` files exist:
  - `apps/web/index.html`
  - `apps/web/src/styles.css`
  - `apps/web/src/main.ts`
  - `apps/web/vite.config.ts`
- Review current homepage sections before editing.
- Review design doc acceptance criteria.
- Confirm generated output such as `apps/web/dist` is not tracked.

Validation:

- No unrelated dirty files are modified.
- Any existing user-created untracked plugin directories remain untouched.

Expected files changed:

- None.

## Phase 1: Rebuild Page Information Architecture

Actions:

- Replace `apps/web/index.html` section structure with the approved documentation portal layout:
  - Header
  - Hero
  - About
  - Documentation Center
  - Architecture
  - Quick Start
  - MCP Surface
  - Plugin System
  - Current Progress / Roadmap
  - Footer
- Keep semantic landmarks: `header`, `main`, `section`, `footer`.
- Keep exactly one `h1`.
- Add stable section IDs for navigation:
  - `overview`
  - `about`
  - `docs`
  - `architecture`
  - `quick-start`
  - `mcp-surface`
  - `plugins`
  - `roadmap`
- Use Chinese-first copy, with technical terms in English where they are natural.
- Add visible links to:
  - GitHub repository
  - `README.md`
  - `README_cn.md`
  - `docs/plugins/development.md`
  - `docs/plugins/standard.md`
  - `docs/clients/generic-mcp-client.md`
  - `docs/deployment/dev.md`
  - `docs/operations/diagnostics.md`
  - `examples/plugins/fake-upload`

Validation:

- A new visitor can answer:
  - What is MCPHub?
  - Where are the docs?
  - How do I verify `/mcp`?
  - What MCP resources/tools are exposed?
  - How does the plugin system work?
- Link targets are real repository paths or the GitHub repository URL.
- Page content remains readable without JavaScript.

## Phase 2: Write Concrete Developer Content

Actions:

- Add an About section that explicitly explains:
  - Why MCPHub exists.
  - What MCPHub is.
  - What MCPHub is not.
- Add a Documentation Center with short descriptions for each doc.
- Add Quick Start commands:

```bash
pnpm install
REQUEST_LOGGING=false pnpm dev
pnpm mcp:client --url http://127.0.0.1:3000/mcp inspect
pnpm plugin:create my-admin --template http-api --tool-name my.admin.users.list
pnpm plugin:verify examples/plugins/my-admin
```

- Add MCP Surface reference content:
  - `/mcp`
  - `initialize`
  - `resources/list`
  - `resources/read`
  - `tools/list`
  - `tools/call`
  - `mcphub://status`
  - `mcphub://plugins`
  - `mcphub://plugins/{pluginId}`
  - `mcphub://plugins/{pluginId}/tools`
  - `mcphub://audit/recent`
  - `/healthz`
  - `/api/status`
  - `/api/plugins`
- Add Plugin System content for:
  - HTTP operation tools.
  - Executor workflow tools.
  - Credentials, policy, and audit.
  - Example plugin directory structure.
- Add Current Progress / Roadmap that distinguishes available features from next priorities.

Validation:

- Copy does not overclaim hosted SaaS, marketplace, production auth, or complete OpenAPI import.
- Content is specific enough that the page no longer feels like a pure marketing shell.
- Long commands and URI values wrap safely.

## Phase 3: Rework Visual System And Layout

Actions:

- Rewrite `apps/web/src/styles.css` around a documentation-first visual system.
- Define tokens:
  - background
  - surface
  - text
  - muted text
  - border
  - accent blue
  - success green
  - dark code panel
- Use mobile-first layout.
- Add responsive behavior for 320px, 375px, 768px, 1024px, and 1440px.
- Implement visual patterns:
  - Compact sticky header.
  - Dense hero with architecture panel.
  - About explanation bands.
  - Documentation cards.
  - Architecture package map.
  - Quick Start code panel.
  - MCP Surface reference grid.
  - Plugin model section.
  - Roadmap/status columns.
  - Footer link grid.

Design constraints:

- Keep a light, readable developer documentation style.
- Use cards only for repeated items and compact panels.
- Do not put cards inside cards.
- Keep border radius at 8px or less.
- Do not use decorative orbs, bokeh blobs, emoji icons, or purely ornamental SVGs.
- Avoid a one-note color palette or a full dark terminal theme.
- Keep text sizes appropriate to their containers.
- Ensure code blocks and long URIs cannot force horizontal page scroll.

Accessibility constraints:

- Body text is at least 16px.
- Focus states are visible.
- Touch targets are at least 44px where practical.
- Sticky header does not obscure anchored sections.
- Honor `prefers-reduced-motion`.
- Do not depend on hover-only content.

Validation:

- No text overlap.
- No horizontal scroll at target viewport widths.
- Hero is not empty or oversized.
- Documentation links are visually prominent.
- MCP Surface is scannable, not buried.

## Phase 4: Adjust Progressive Enhancement

Actions:

- Review `apps/web/src/main.ts`.
- Keep useful existing enhancements if they still fit:
  - current year
  - active hash navigation
  - copy buttons
- Update selectors and copied content IDs to match the new page.
- Remove enhancement code that no longer corresponds to the new markup.

Validation:

- `pnpm --filter @mcphub/web typecheck` passes.
- If JavaScript fails or is disabled, all core content remains visible and usable.
- Copy buttons have accessible labels and clear success/failure feedback if retained.

## Phase 5: Local Web Verification

Actions:

- Run:

```bash
pnpm --filter @mcphub/web typecheck
pnpm --filter @mcphub/web build
```

- Start Vite:

```bash
pnpm --filter @mcphub/web dev
```

- Use another port if `5173` is already occupied.
- Open or inspect the local URL.
- Check viewports:
  - 320px
  - 375px
  - 768px
  - 1024px
  - 1440px
- Prefer CDP viewport emulation when using headless Chrome, because `--window-size` may not match CSS viewport dimensions.

Validation:

- `scrollWidth <= clientWidth` at each viewport.
- Header/navigation does not overlap content.
- Code panels and MCP URI lists are readable.
- Documentation cards are visible and useful.
- No generated `dist` or `tsbuildinfo` files are staged.
- Stop any dev server or browser session before final response.

## Phase 6: Workspace Verification

Run:

```bash
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Validation:

- Root workspace build still includes `@mcphub/web`.
- No MCP server, plugin runtime, or package API behavior changed.
- Any failure is fixed in the frontend implementation rather than by excluding the web app from validation.

## Phase 7: Review, Commit, And Report

Actions:

- Review `git diff --stat`.
- Review changed files manually.
- Confirm only intended files are staged.
- Commit implementation as one focused commit unless changes naturally split.

Expected implementation commit message:

```text
Redesign project homepage as docs portal
```

Final report should include:

- Files changed.
- What changed from the previous homepage.
- Verification commands and results.
- Local dev URL if a dev server is still intentionally running for user review.
- Note if GitHub Pages deployment requires merging/pushing to `main`.

## Acceptance Checklist

- [ ] Homepage includes real project introduction and About content.
- [ ] Documentation Center links to the main docs with descriptions.
- [ ] Architecture section explains app/package relationships at a useful level.
- [ ] Quick Start shows install, server start, MCP inspect, plugin create, and plugin verify commands.
- [ ] MCP Surface section lists endpoint, methods, platform resources, and HTTP diagnostics.
- [ ] Plugin System section explains HTTP operation and executor workflow modes.
- [ ] Current Progress / Roadmap separates available features from next priorities.
- [ ] Layout works at 320px, 375px, 768px, 1024px, and 1440px without horizontal scroll.
- [ ] `pnpm --filter @mcphub/web typecheck` passes.
- [ ] `pnpm --filter @mcphub/web build` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] `git diff --check` passes.
