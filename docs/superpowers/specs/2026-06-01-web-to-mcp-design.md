# Web to MCP Design

Date: 2026-06-01

## Goal

Build a server-deployable tool, similar in spirit to RSSHub, that turns supported web pages and sites into MCP-readable resources for agents. The service can be self-hosted or run as a public network service. Users configure the MCP endpoint in their agent client, and a browser extension helps users detect whether the current website already has MCP support.

## Confirmed Product Decisions

- Product mode: hybrid extraction with both generic extraction and site-specific routes.
- Deployment: server-side MCP service, usable as self-hosted infrastructure or as a public hosted service.
- MCP exposure: Resources plus Tools.
- Browser extension: detector only. It sends current website metadata to the server and displays the server result. It does not crawl, annotate, scrape, or execute extraction.
- Core internal model: `Source`, `Rule`, `Document`, and `FeedItem`.
- MVP focus: stable reading, refresh, preview, diagnostics, and website support detection.

## Non-Goals for MVP

- Browser-based page annotation.
- Browser-side crawling or DOM scraping.
- Login-state proxy crawling.
- Public rule submission and review workflow.
- Team-level multi-tenant permissions.
- Visual rule editor.
- RSS or Atom output compatibility.
- Large distributed scheduling cluster.

## Architecture

The system has five major modules.

### Browser Detector Extension

The extension is a lightweight MCPHub detector. When a user opens a website, it reads only basic public page information:

- current URL
- hostname
- page title
- canonical URL
- meta description
- language

It sends this information to the server through a normal HTTPS API such as `/api/detect-site`. The server returns whether the site has MCP support. The extension displays the result and, when available, provides the MCP server address, Source URI, or an agent configuration snippet.

The extension does not inspect full DOM structure, upload page content, read cookies, perform crawling, or generate extraction rules.

### Rule Registry

The rule registry stores extraction capability metadata. It supports:

- public rules bundled with a public instance
- private rules for a self-hosted instance
- site-specific route rules
- validated generic extraction rules
- rule versions
- rule health status and diagnostics

The MVP does not include public rule submission. Rules are imported or managed by instance operators.

### Fetch and Extract Engine

The extraction engine turns a Source into Documents and FeedItems. Extraction priority is:

1. site-specific route
2. validated rule
3. generic extraction fallback

Site-specific routes provide high quality for important websites. Validated rules cover common structured pages. Generic extraction gives broad fallback support for ordinary article or list pages.

### Cache and Scheduler

The cache layer stores recent extraction results and diagnostics. Each Source has:

- refresh TTL
- last successful refresh time
- last error
- failure count
- backoff state
- item diff hashes

Agent reads should prefer cached results. Explicit refreshes use MCP Tools.

### MCP Gateway

The MCP gateway exposes extracted content to agent clients. It follows MCP's Resources and Tools split:

- Resources expose stable readable context.
- Tools perform actions such as search, refresh, preview, and diagnostics.

The recommended transport for a hosted service is Streamable HTTP. Stdio can be added later for local development wrappers if needed.

## Data Model

### Source

A Source represents a supported website, page collection, route, or feed-like target.

Key fields:

- `id`
- `name`
- `description`
- `urlPattern`
- `routeKey`
- `owner`
- `visibility`
- `refreshPolicy`
- `authRequirement`
- `riskFlags`
- `healthStatus`

### Rule

A Rule describes how a Source is extracted.

Rule types:

- `generic`
- `validated`
- `custom_route`

Key fields:

- `id`
- `sourceId`
- `type`
- `version`
- `urlPattern`
- `fieldMappings`
- `paginationPolicy`
- `cleaningPolicy`
- `sampleUrls`
- `confidence`
- `status`

### Document

A Document represents one extracted page-level result.

Key fields:

- `id`
- `sourceId`
- `canonicalUrl`
- `title`
- `contentText`
- `contentHtml`
- `summary`
- `byline`
- `publishedAt`
- `fetchedAt`
- `sourceRefs`
- `confidence`
- `extractionWarnings`

### FeedItem

A FeedItem represents a list or subscription item, similar to an RSS item but optimized for agent use.

Key fields:

- `id`
- `sourceId`
- `documentId`
- `title`
- `url`
- `snippet`
- `contentRef`
- `publishedAt`
- `updatedAt`
- `tags`
- `entities`
- `readabilityScore`
- `diffHash`

## MCP Resources

Resources expose stable readable content.

- `webmcp://sources`
  Lists available Sources for the current instance and user scope.

- `webmcp://sources/{sourceId}`
  Reads a Source summary, health, rule version, refresh policy, and recent diagnostics.

- `webmcp://sources/{sourceId}/items`
  Reads the latest FeedItem list for a Source.

- `webmcp://items/{itemId}`
  Reads a full item and its linked Document content.

- `webmcp://rules/{ruleId}/diagnostics`
  Reads rule diagnostics and extraction confidence.

## MCP Tools

Tools perform actions or parameterized reads.

### Required for MVP

- `source.search(query, filters)`
  Searches available Sources.

- `source.refresh(sourceId, mode)`
  Triggers refresh. `mode` supports `cached`, `force`, and `validate_only`.

- `extract.preview(url, ruleId?)`
  Runs a preview extraction without writing formal cached content.

- `debug.explain(itemId | sourceId)`
  Explains extraction path, rule choice, confidence, warnings, and failures.

### Deferred

- `rule.validate(ruleDraft)`
  Useful when rule editing exists. In the revised MVP, the browser extension does not generate rule drafts, so this can be implemented later unless operators need a rule import validator.

- `rule.publish(ruleDraft, visibility)`
  Deferred with public rule submission and review.

## Browser Detector API

The extension calls a normal HTTP API, not MCP.

### Request

`POST /api/detect-site`

```json
{
  "url": "https://example.com/articles/123",
  "hostname": "example.com",
  "title": "Example Article",
  "canonicalUrl": "https://example.com/articles/123",
  "metaDescription": "Short public page description",
  "language": "en"
}
```

### Response

```json
{
  "status": "available",
  "sourceId": "src_example_articles",
  "sourceName": "Example Articles",
  "supportScope": "articles",
  "mcpServerUrl": "https://mcphub.example.com/mcp",
  "resourceUri": "webmcp://sources/src_example_articles",
  "lastRefreshedAt": "2026-06-01T00:00:00Z",
  "message": "This site is available as an MCP source."
}
```

Valid status values:

- `available`: a matching Source exists and is exposed through MCP.
- `partial`: the domain has partial support.
- `previewable`: generic extraction may work, but no stable Source exists.
- `unsupported`: no Source or rule exists.
- `restricted`: support requires private configuration, authorization, or policy restrictions.
- `error`: detection failed.

## Server Workflows

### Site Detection Workflow

1. Extension sends website metadata.
2. Server normalizes URL and hostname.
3. Server strips tracking parameters and resolves canonical URL when available.
4. Server matches exact Source, domain-level Source, or URL pattern.
5. Server checks visibility, policy, and health.
6. Server returns detection status and MCP configuration details when available.

### Agent Read Workflow

1. Agent lists Sources or searches Sources through MCP.
2. Agent reads `webmcp://sources/{sourceId}/items`.
3. Server returns cached FeedItems when cache is fresh.
4. If cache is stale, server may return existing cache plus stale metadata, or the agent can call `source.refresh`.
5. Refresh selects extraction method by priority: custom route, validated rule, generic extraction.
6. Server writes Documents, FeedItems, diff hashes, and diagnostics.
7. Agent reads individual items through `webmcp://items/{itemId}`.

## Error Handling

Errors should be structured and visible through Source health, extension detection responses, and `debug.explain`.

Standard error codes:

- `FETCH_BLOCKED`: target site denied access, returned 403, captcha, or anti-bot challenge.
- `FETCH_TIMEOUT`: network or rendering timeout.
- `RULE_MISMATCH`: rule matched URL but required fields were missing.
- `EXTRACTION_LOW_CONFIDENCE`: generic extraction produced weak results.
- `AUTH_REQUIRED`: content requires login and is not suitable for public hosted extraction.
- `RATE_LIMITED`: service-side rate limit or site-specific limit was reached.
- `UNSUPPORTED_SITE`: no Source or Rule exists.
- `ROBOTS_OR_POLICY_BLOCKED`: service policy blocks extraction.

Each error record should include:

- error code
- human-readable message
- source ID when available
- URL
- extraction method attempted
- timestamp
- retryability
- suggested next action

## MVP Scope

The MVP includes:

1. Server-side MCP Gateway with Streamable HTTP.
2. Resources for Sources, Source items, and item reads.
3. Tools for source search, refresh, extraction preview, and debug explain.
4. Source, Rule, Document, FeedItem, and diagnostics storage.
5. Hybrid extraction engine with 3-5 sample custom routes plus generic fallback.
6. Cache TTL, refresh status, failure count, and backoff.
7. Browser detector extension calling `/api/detect-site`.
8. Self-hosted and public-instance configuration through environment variables.

## Acceptance Criteria

- Opening a supported website in the extension shows `available` and a usable MCP Source URI or MCP server configuration.
- Opening an unsupported website shows `unsupported` or `previewable`.
- An agent can list Sources, read Source items, and read individual item content through MCP.
- A stale Source can be refreshed through an MCP Tool.
- Failed extraction produces a clear diagnostic error visible through `debug.explain`.
- The same service can run as a self-hosted instance or a public hosted instance.

## Testing Strategy

- Unit tests for URL normalization, Source matching, Rule selection priority, cache freshness, and error code mapping.
- Integration tests for MCP Resources and Tools using fixture Sources.
- Extraction fixture tests for sample custom routes and generic fallback pages.
- API tests for `/api/detect-site` status transitions.
- End-to-end smoke test: extension-like request detects a supported site, Agent-like MCP read returns Source items, and debug explain returns extraction metadata.

## References

- MCP basic protocol: https://modelcontextprotocol.io/specification/2025-11-25/basic/index
- MCP Resources: https://modelcontextprotocol.io/specification/2025-11-25/server/resources
- MCP Tools: https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- MCP Transports: https://modelcontextprotocol.io/specification/2025-11-25/basic/transports
- MCP specification repository: https://github.com/modelcontextprotocol/modelcontextprotocol
- RSSHub route development: https://docs.rsshub.app/joinus/new-rss/start-code
- RSSHub debugging: https://docs.rsshub.app/joinus/advanced/debug
- Chrome extension messaging: https://developer.chrome.com/docs/extensions/mv3/messaging
- MDN WebExtensions content scripts: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Content_scripts
