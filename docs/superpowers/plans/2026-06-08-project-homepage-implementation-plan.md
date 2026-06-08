# MCPHub Independent Homepage Implementation Plan

Date: 2026-06-08
Design: `docs/superpowers/specs/2026-06-08-project-homepage-design.md`

## Objective

Implement an independent `apps/web` homepage for MCPHub.

The page should introduce MCPHub as a developer-facing MCP middleware platform, explain the plugin workflow, show current dev capabilities, and point visitors to concrete repository docs and examples.

The implementation must stay separate from `apps/server`. It must not change MCP/API runtime behavior.

## Scope

Included:

- New `@mcphub/web` workspace app under `apps/web`.
- Vite + TypeScript + semantic HTML + plain CSS.
- Static homepage content based on the approved design.
- Responsive layout for mobile and desktop.
- Accessible links, focus states, heading order, and reduced-motion support.
- Build/typecheck/lint verification.
- Local browser verification through Vite dev server.

Excluded:

- React or another UI framework.
- Live `/api/status` integration.
- Product dashboard or plugin management UI.
- Authentication, hosted onboarding, or account flows.
- Plugin marketplace.
- Docs router or full documentation site.
- Language switcher.
- New browser automation framework.

## Phase 0: Baseline And Worktree Protection

Actions:

- Confirm branch and worktree state with `git status --short --branch`.
- Confirm latest design document is present.
- Confirm `apps/web` does not already exist.
- Check current root scripts and workspace config.

Expected files changed:

- None.

Validation:

- No unrelated dirty files are modified.
- Any existing user changes are preserved.

## Phase 1: Create Workspace App Skeleton

Actions:

- Add `apps/web/package.json`.
- Add `apps/web/tsconfig.json`.
- Add `apps/web/vite.config.ts`.
- Add `apps/web/index.html`.
- Add `apps/web/src/main.ts`.
- Add `apps/web/src/styles.css`.

Implementation details:

- Package name: `@mcphub/web`.
- Scripts:
  - `dev`: `vite --host 127.0.0.1`
  - `build`: `vite build`
  - `typecheck`: `tsc -p tsconfig.json --noEmit`
- Use the existing root Vite dependency.
- Keep generated `dist` and `*.tsbuildinfo` ignored by existing `.gitignore`.

Validation:

- `pnpm --filter @mcphub/web typecheck` can resolve the package.
- `pnpm --filter @mcphub/web build` can start the Vite build path after page content exists.

## Phase 2: Implement Semantic Page Content

Actions:

- Build the static page in `apps/web/index.html`.
- Use semantic landmarks:
  - `header`
  - `main`
  - `section`
  - `footer`
- Use one `h1`.
- Add section headings for:
  - Hero.
  - Platform positioning.
  - Core capabilities.
  - Developer workflow.
  - Plugin model.
  - Current status and roadmap.
  - Final CTA.

Content requirements:

- Explain MCPHub as:
  - MCP middleware.
  - Plugin platform.
  - RSSHub-like adapter model for MCP tools.
- Avoid overclaiming unfinished features.
- Link to existing docs and examples:
  - `../../README.md`
  - `../../README_cn.md`
  - `../../docs/plugins/development.md`
  - `../../docs/plugins/standard.md`
  - `../../examples/plugins/fake-upload/`
- Include command snippets for:
  - `plugin:create`
  - `plugin:verify`
  - `MCPHUB_PLUGIN_DIR=examples/plugins pnpm dev`
  - `pnpm mcp:client --url http://127.0.0.1:3000/mcp list-tools`

Validation:

- Page remains readable without JavaScript.
- Link targets point to real repository paths from `apps/web/index.html`.
- No emoji icons are used as structural UI.

## Phase 3: Implement Visual System And Layout CSS

Actions:

- Define CSS tokens in `:root`.
- Implement mobile-first layout.
- Add responsive breakpoints around 768px and 1024px.
- Implement:
  - Sticky or simple top navigation.
  - Hero grid.
  - Dark flow panel.
  - Capability grid.
  - Workflow command panel.
  - Plugin model panel.
  - Status/roadmap section.
  - Footer.

Design constraints:

- Use a light documentation-like base.
- Use dark terminal/product panels as focused visual elements.
- Use green for running/verified states.
- Use blue for protocol/platform accents.
- Keep card radius at 8px or less.
- Do not use decorative gradient orbs, bokeh blobs, emoji icons, or all-purple/all-blue palette dominance.
- Avoid nested cards.
- Keep text readable and wrapped inside containers.

Accessibility constraints:

- Body text at least 16px.
- Focus states visible.
- Touch targets at least 44px tall for CTA/navigation anchors where practical.
- Contrast sufficient for normal text and code panels.
- No horizontal scroll at 375px.
- Respect `prefers-reduced-motion`.

Validation:

- Manual visual check in browser at 375px, 768px, 1024px, and 1440px.
- No text overlap.
- No layout shift on hover/focus.

## Phase 4: Add Small Progressive Enhancement

Actions:

- Keep `apps/web/src/main.ts` small.
- Add optional progressive enhancement only if useful, such as:
  - Current year in footer.
  - Active nav highlighting on hash navigation.
  - Copy command buttons if they can be implemented accessibly and simply.

Preferred first implementation:

- Avoid interactive features unless they improve clarity.
- If copy buttons are added, they must have visible labels and success feedback.

Validation:

- If JavaScript is disabled, all core content remains visible.
- TypeScript has no implicit any or DOM null errors.

## Phase 5: Add Documentation Entrypoints

Actions:

- Update root `README.md` with a short web homepage section.
- Update `README_cn.md` with the same information in Chinese.
- Mention:
  - `pnpm --filter @mcphub/web dev`
  - `pnpm --filter @mcphub/web build`
  - The homepage is independent from `apps/server`.

Validation:

- README updates are concise and do not duplicate the full homepage content.

## Phase 6: Automated Verification

Run:

```bash
pnpm --filter @mcphub/web typecheck
pnpm --filter @mcphub/web build
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

Notes:

- `pnpm build` will include `@mcphub/web` through the workspace.
- If root build fails because the new app is included, fix the app rather than excluding it.
- Do not commit generated `apps/web/dist` or `.tsbuildinfo` files.

## Phase 7: Browser Verification

Actions:

- Start Vite dev server:

```bash
pnpm --filter @mcphub/web dev
```

- Use an available port if the default Vite port is occupied.
- Inspect the local URL in browser or with screenshots if available.
- Check:
  - Desktop layout.
  - Mobile 375px layout.
  - No horizontal scroll.
  - Hero visual readable.
  - Code panels readable.
  - Focus states visible.
  - Links usable.

Validation:

- Record the local URL used.
- Stop the dev server before final response.

## Phase 8: Commit And Report

Actions:

- Review `git diff --stat`.
- Confirm no generated output is staged.
- Commit implementation in one focused commit unless changes naturally split:
  - `Add independent project homepage`

Final report should include:

- Files added/changed.
- Verification commands run and results.
- Local URL if the dev server was run during verification.
- Any limitations or follow-up work.

## Risks And Mitigations

| Risk | Mitigation |
|------|------------|
| Homepage becomes a marketing page that overpromises current capability | Keep status section honest and list unfinished items under roadmap |
| New app breaks root `pnpm build` | Include `build` and `typecheck` scripts from the start and verify root build |
| Layout looks good only on desktop | Mobile-first CSS and explicit 375px browser check |
| Code blocks overflow on mobile | Use wrapping or horizontal scroll inside code panel only, never whole-page scroll |
| Static links break after Vite build path changes | Use relative repository links intentionally and verify click targets in dev server |
| Visual style becomes too dark or one-note | Keep light page base and use dark panels only for product/CLI visuals |

## Acceptance Checklist

- [ ] `apps/web` exists and is included by the workspace.
- [ ] Homepage content matches the approved information architecture.
- [ ] `pnpm --filter @mcphub/web typecheck` passes.
- [ ] `pnpm --filter @mcphub/web build` passes.
- [ ] `pnpm lint` passes.
- [ ] `pnpm typecheck` passes.
- [ ] `pnpm build` passes.
- [ ] `git diff --check` passes.
- [ ] Browser verification passes at desktop and 375px mobile width.
- [ ] No generated `dist` or `.tsbuildinfo` files are committed.
