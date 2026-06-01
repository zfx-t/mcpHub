# Web to MCP Implementation Plan

Date: 2026-06-01
Source design: `docs/superpowers/specs/2026-06-01-web-to-mcp-design.md`

## Objective

Implement the approved Web to MCP MVP: a server-deployable service that exposes web content as MCP Resources and Tools, plus a browser detector extension that checks whether the current website is available as an MCP source.

## Working Assumptions

- Use a TypeScript monorepo because the project spans a Node server, shared schemas, and a browser extension.
- Use `pnpm` workspaces unless the user requests another package manager.
- Use the official MCP SDK for the MCP gateway.
- Use PostgreSQL as the production database target, with Docker Compose for local development.
- Keep the browser extension minimal and Manifest V3 compatible.
- Do not implement browser-side crawling, DOM scraping, annotation, login-state proxy crawling, RSS output, or public rule submission in the MVP.

## Proposed Repository Shape

```text
.
|-- apps/
|   |-- server/
|   `-- extension/
|-- packages/
|   |-- core/
|   |-- db/
|   |-- extractors/
|   `-- mcp/
|-- docs/
|   `-- superpowers/
|-- fixtures/
|   |-- pages/
|   `-- routes/
`-- scripts/
```

### Package Responsibilities

- `apps/server`: HTTP API, MCP transport endpoint, app wiring, configuration, health checks.
- `apps/extension`: browser detector extension UI, background/service worker, current-tab metadata collection.
- `packages/core`: shared domain types, validation schemas, error codes, URL normalization, Source matching contracts.
- `packages/db`: schema, migrations, repository implementations, seed data.
- `packages/extractors`: site-specific routes, validated rule runner, generic extraction fallback, diagnostics.
- `packages/mcp`: MCP Resources and Tools mapping over core services.
- `fixtures`: deterministic HTML and route fixtures for extraction and integration tests.

## Phase 0: Project Scaffold

Deliverables:

- Workspace package setup.
- TypeScript, linting, formatting, and test runner configuration.
- Basic CI command set: typecheck, lint, test.
- Docker Compose with PostgreSQL.
- Environment variable template.

Implementation notes:

- Keep build tooling boring and shared.
- Add path aliases only where they materially improve imports.
- Prefer explicit package boundaries over a large server-only codebase.

Exit criteria:

- `pnpm install`, `pnpm typecheck`, and `pnpm test` run successfully.
- Empty packages compile.

## Phase 1: Domain Model and Storage

Deliverables:

- `Source`, `Rule`, `Document`, `FeedItem`, diagnostic, and refresh status schemas.
- Database migrations.
- Repository interfaces and PostgreSQL implementations.
- Seed data for 3-5 sample sources.
- Structured error code definitions matching the design document.

Implementation notes:

- Put validation at API and repository boundaries.
- Store raw extraction diagnostics separately from user-facing Source health.
- Use stable IDs and URI-safe identifiers for MCP resources.

Exit criteria:

- Unit tests cover schema validation, URL normalization, Source matching, and repository CRUD.
- Seed data can be loaded into a fresh local database.

## Phase 2: Detection API

Deliverables:

- `POST /api/detect-site`.
- Hostname, canonical URL, and URL-pattern matching.
- Response statuses: `available`, `partial`, `previewable`, `unsupported`, `restricted`, `error`.
- Public MCP endpoint and resource URI fields in successful responses.
- API tests for status transitions.

Implementation notes:

- The API accepts only lightweight public metadata from the extension.
- The server is responsible for all matching and policy decisions.
- Detection should not trigger full crawling.

Exit criteria:

- Supported fixture domains return `available`.
- Unknown fixture domains return `unsupported` or `previewable`.
- Restricted sources return `restricted` without leaking private rule details.

## Phase 3: Extract and Cache Engine

Deliverables:

- Extraction coordinator with priority: custom route, validated rule, generic fallback.
- Custom route interface.
- 3-5 sample custom routes.
- Generic article/list extraction fallback.
- Cache freshness checks, refresh TTL, failure count, backoff, and diff hash generation.
- Diagnostic records for extraction path, confidence, warnings, and failures.

Implementation notes:

- Each extractor returns a normalized result plus diagnostics.
- Route fixtures should make tests deterministic.
- Keep network fetching behind an interface so tests can use local fixtures.

Exit criteria:

- Fixture extraction tests cover success, low confidence, rule mismatch, and fetch failure.
- Refresh updates Documents, FeedItems, Source health, and diagnostics consistently.

## Phase 4: MCP Gateway

Deliverables:

- Streamable HTTP MCP endpoint.
- Resources:
  - `webmcp://sources`
  - `webmcp://sources/{sourceId}`
  - `webmcp://sources/{sourceId}/items`
  - `webmcp://items/{itemId}`
  - `webmcp://rules/{ruleId}/diagnostics`
- Tools:
  - `source.search`
  - `source.refresh`
  - `extract.preview`
  - `debug.explain`

Implementation notes:

- Resource reads should prefer cached content.
- Refresh is explicit through tools.
- Tool inputs must be schema-validated and return structured errors.

Exit criteria:

- MCP integration tests can list sources, read items, refresh a source, preview a URL, and explain diagnostics.
- Failed operations expose the standard error codes from the design document.

## Phase 5: Browser Detector Extension

Deliverables:

- Manifest V3 extension.
- Current-tab metadata collector for URL, hostname, title, canonical URL, meta description, and language.
- Extension popup showing detection status and details.
- Server URL configuration.
- Copyable MCP server URL, Source URI, or agent config snippet when available.

Implementation notes:

- Do not crawl, scrape full DOM content, read cookies, or generate rules.
- Use the extension service worker/background path for privileged browser APIs.
- Keep permissions narrow.

Exit criteria:

- Extension can query a local server and show every detection status.
- Manual smoke test works against seeded sample sources.

## Phase 6: Deployment and Operations

Deliverables:

- Dockerfile for the server.
- Docker Compose for server plus PostgreSQL.
- Configuration docs for self-hosting and public instance mode.
- Health endpoint.
- Basic logging and request IDs.
- Rate limit and fetch timeout configuration.

Implementation notes:

- Public-instance and self-host modes should differ by configuration, not by code forks.
- Do not add team-level permissions in MVP.

Exit criteria:

- A fresh clone can start the service locally with documented commands.
- Seeded sources are visible through MCP and the detector API.

## Phase 7: End-to-End Validation

Deliverables:

- End-to-end smoke script:
  1. start database and server
  2. seed sample sources
  3. call `/api/detect-site`
  4. read MCP sources
  5. refresh a source
  6. read item content
  7. call `debug.explain`
- Test coverage summary.
- MVP acceptance checklist.

Exit criteria:

- All acceptance criteria from the design document pass.
- Known limitations are documented.

## Suggested Implementation Order

1. Scaffold repository and tooling.
2. Add core schemas and database layer.
3. Build detection API because it is small and validates Source matching early.
4. Build extraction and cache engine.
5. Add MCP gateway over the same services.
6. Add browser extension after the server contract is stable.
7. Add deployment and end-to-end validation.

## Review Checkpoints

- After Phase 0: confirm repository shape and developer commands.
- After Phase 2: confirm detection API response shape before building the extension.
- After Phase 4: confirm MCP Resource and Tool behavior before adding UI.
- After Phase 7: confirm MVP acceptance before expanding scope.

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Generic extraction quality varies widely | Treat generic extraction as previewable or low-confidence unless validated |
| Target sites block fetching | Surface `FETCH_BLOCKED`, support backoff, avoid pretending content is available |
| MCP endpoint becomes tightly coupled to storage | Put MCP mapping in `packages/mcp` over service interfaces |
| Extension scope creeps into scraping | Keep extension contract limited to public page metadata |
| Public hosted mode needs stricter policy | Add policy checks and `restricted` status early, defer account/team permissions |

## Out of Scope Until After MVP

- Rule editor and public rule submission.
- Login-protected extraction.
- RSS or Atom output.
- Distributed scheduler.
- Multi-tenant team administration.
- Browser-side extraction.
