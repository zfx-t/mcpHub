# QWeather Plugin Design

Date: 2026-07-01

## Goal

Add a real-world example plugin, `qweather`, that demonstrates MCPHub's core differentiator against a naive "convert every OpenAPI endpoint into one MCP tool" approach: instead of exposing QWeather's REST endpoints one-to-one, the plugin curates and orchestrates several underlying calls into a small number of task-oriented tools. The plugin also keeps one uncurated tool as a deliberate contrast case, so the README can show both styles side by side.

This is scoped as a demonstration plugin for a portfolio/resume project, not a general-purpose weather integration. It reuses MCPHub's existing plugin SDK, credential store, policy engine, and audit/checkpoint mechanism without any core runtime changes.

## Background: Verified API Behavior

QWeather (和风天气) exposes a documented REST API with Swagger/OpenAPI-style reference docs. Authentication in 2026 is transitioning from API Key to JWT (Ed25519), but API Key via the `X-QW-Api-Key` header remains supported and is sufficient for this project's timeline. Each developer project has a dedicated API host (e.g. `n86yw34yt3.re.qweatherapi.com`).

The following endpoints were manually verified against the free subscription tier using a real API key before this design was written:

| Endpoint | Free tier | Notes |
|---|---|---|
| `GET /geo/v2/city/lookup?location={name}` | Available | Returns a ranked list of matching locations with `id`, `name`, `lat`, `lon` |
| `GET /v7/weather/now?location={id}` | Available | Current conditions |
| `GET /v7/weather/3d?location={id}` / `/7d` | Available | Multi-day forecast |
| `GET /v7/indices/1d?location={id}&type=...` | Available | Life indices (sport, clothing, UV, etc.) |
| `GET /v7/astronomy/sun?location={id}&date=...` | Available | Sunrise/sunset |
| `GET /v7/air/now` | **403 Forbidden** | Requires paid subscription |
| `GET /v7/warning/now` | **403 Forbidden** | Requires paid subscription |
| `GET /v7/minutely/5m` | **403 Forbidden** | Security-restricted on this account |

The plugin design only uses endpoints confirmed available on the free tier. Air quality and weather alerts are explicitly out of scope because they are not reachable with the credentials this project will ship with, and a demo that 403s during a live walkthrough undermines the whole point of the exercise.

## Non-Goals

- No OpenAPI/Swagger auto-import tooling. Tools are hand-written using the existing `defineApiTool()` / `defineExecutorTool()` SDK, matching the "手选接口，手写插件" scope decision.
- No JWT (Ed25519) authentication. API Key via `api_key_header` credential type only.
- No air quality, weather alert, or minutely precipitation tools (not available on the free tier).
- No caching, scheduling, or MCPHub `Source`/`Rule` model integration. This plugin is a standalone API-to-MCP plugin, not a Web-to-MCP content source.
- No production hardening (retry policies, circuit breakers). Errors surface directly through the existing `PLUGIN_EXECUTION_ERROR` normalization.

## Plugin Shape

Plugin id: `qweather`. Directory: `examples/plugins/qweather/` (co-located with `examples/plugins/fake-upload`, following the same demo-plugin convention already established in the repo).

### Configuration

`plugin.config.json`:

```json
{
  "enabled": true,
  "config": {
    "baseUrl": "https://n86yw34yt3.re.qweatherapi.com"
  },
  "credentials": {
    "qweather-key": {
      "type": "api_key_header",
      "secretRef": "env:QWEATHER_API_KEY",
      "scope": "X-QW-Api-Key"
    }
  },
  "policy": {
    "dangerousMode": "auditOnly"
  }
}
```

`baseUrl` is the project-specific API host from the QWeather console. The `scope` field on the credential binding is the literal header name; this matches the existing `api_key_header` handling in `packages/api-connector/src/connector.ts`, which sets `headers.set(scope, credential.value)`.

All three tools declare `credentialRefs: ["qweather-key"]` and are `effect: "read"` (no tool in this plugin performs a write or destructive action against QWeather).

### Tool 1 — `weather.now.raw` (uncurated contrast case)

Declared with `defineApiTool()`, a direct one-to-one mapping of `GET /v7/weather/now`.

- Input: `{ location: string }` (caller must already know the QWeather numeric location id; the field is named `location` — not `locationId` — because MCPHub's declarative HTTP tool gateway forwards non-path input fields verbatim as query parameters, and QWeather's query parameter is named `location`. See `packages/mcp/src/gateway.ts` `requestForTool()`.)
- Output: raw QWeather `now` payload, passed through unmodified

Purpose: this tool is intentionally left as a naive endpoint wrapper. The README uses it as the "before" example — what you get if you map OpenAPI operations to MCP tools one-to-one, including the awkwardness of forcing the caller to already know an opaque numeric location id.

### Tool 2 — `weather.city.lookup` (curated, 2-call orchestration)

Declared with `defineExecutorTool()`. Handler: `lookupWeather`.

- Input: `{ city: string }` (e.g. `"北京"`)
- Orchestration:
  1. `context.http.get("/geo/v2/city/lookup", { query: { location: city } })`
  2. Take the first result's `id`; if no results, throw a descriptive error (surfaces as `PLUGIN_EXECUTION_ERROR`)
  3. `context.http.get("/v7/weather/now", { query: { location: locationId } })`
- Checkpoints: `geo_resolved` (summary: matched location name + id), `weather_fetched`
- Output: `{ city, resolvedLocation: { id, name, adm1, adm2 }, now: { tempC, feelsLikeC, text, windDir, windScale, humidity } }` — a flattened, renamed subset of the raw QWeather fields (e.g. `temp` → `tempC`) rather than passing the raw payload through, since part of the curation story is shaping output for agent consumption, not just chaining calls.

Purpose: demonstrates the minimum viable curation — hiding the two-call geo-resolution dance behind a single city-name input.

### Tool 3 — `weather.trip.advisor` (flagship, 4-call orchestration)

Declared with `defineExecutorTool()`. Handler: `tripAdvisor`.

- Input: `{ city: string, days: 3 | 7 }` (default `3`)
- Orchestration:
  1. `context.http.get("/geo/v2/city/lookup", ...)` → resolve `locationId`
  2. `context.http.get("/v7/weather/{days}d", { query: { location: locationId } })` → forecast
  3. `context.http.get("/v7/indices/1d", { query: { location: locationId, type: "1,3,5" } })` → sport, clothing, UV indices (type codes per QWeather life-index reference)
  4. `context.http.get("/v7/astronomy/sun", { query: { location: locationId, date: <today, yyyyMMdd> } })` → sunrise/sunset
  5. Aggregate into a per-day advisory list plus one natural-language summary line
- Checkpoints: `geo_resolved`, `forecast_fetched`, `indices_fetched`, `astronomy_fetched`, `aggregated`
- Output shape:
  ```json
  {
    "city": "北京",
    "resolvedLocation": { "id": "101010100", "name": "北京" },
    "days": [
      {
        "date": "2026-07-01",
        "tempMaxC": 31, "tempMinC": 22,
        "condition": "多云",
        "sportIndex": { "level": "2", "category": "较适宜" },
        "clothingIndex": { "level": "6", "category": "热" },
        "uvIndex": { "level": "7" },
        "sunrise": "04:50", "sunset": "19:48"
      }
    ],
    "summary": "human-readable one- or two-sentence advisory across the requested days"
  }
  ```
  The `summary` field is generated by a small local rule set (e.g. flagging high UV, hot/cold extremes, or rain in `condition` text) — no external LLM call. This keeps the demo self-contained and deterministic.

Purpose: this is the tool that makes the project's core argument concrete — one MCP tool call replaces what would otherwise require an agent to make 4 separate tool calls and reason about how to combine their outputs itself.

## Error Handling

- Missing/invalid API key: the QWeather API returns a non-200 JSON body with an `error` object. Handlers check `response.error` after each `context.http.get()` call and throw `new Error(...)` with the QWeather error detail. This is caught by the existing `PluginExecutorRuntime.execute()` catch block and normalized to `PLUGIN_EXECUTION_ERROR`, matching current behavior for `fake-upload`.
- City not found (empty geo lookup result): handlers throw a descriptive error (`"No location found for city '<name>'."`) rather than proceeding with an undefined location id.
- No new `PlatformErrorCode` values are introduced.

## Testing Strategy

- No new automated test infrastructure is introduced beyond what `examples/plugins/fake-upload` already established. Verification for this plugin is manual, following the same pattern used to verify `fake-upload` earlier in this project:
  1. `pnpm plugin:verify examples/plugins/qweather` — static manifest/handler validation (no live network call).
  2. Manual smoke: start the dev server with `MCPHUB_PLUGIN_DIR` pointing at `examples/plugins/`, plus `QWEATHER_API_KEY` set, and call all three tools through `pnpm mcp:client call-tool` against the real QWeather API, confirming real responses (not mocked).
  3. Confirm `mcphub://audit/recent` shows the expected checkpoint sequence for `weather.trip.advisor`.
- This plugin does not add a `pnpm test:plugin`-style scripted fixture (unlike `fake-upload`, which stands up a local fixture HTTP server). Since QWeather is a real external API requiring a real key, adding it to the repo's default `pnpm test` / `pnpm test:e2e` suite is out of scope — those must remain runnable without external credentials.

## Documentation

- `examples/plugins/qweather/README.md` (new, plugin-local) explains: what QWeather is, how to obtain a free API key, the three tools with their curation rationale, and the core argument (uncurated endpoint mapping vs. task-oriented orchestration) that motivates the plugin's existence.
- Root `README.md` / `README_cn.md` gain one short entry under the existing examples-plugins section pointing at `examples/plugins/qweather`, consistent with how `fake-upload` is already referenced.

## Acceptance Criteria

- `pnpm plugin:verify examples/plugins/qweather` passes with `Standard: compatible`.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm test:e2e`, `pnpm test:plugin`, `pnpm build` all continue to pass unchanged (this plugin must not affect the existing suite, since it is not wired into it).
- With a real `QWEATHER_API_KEY` set and the plugin loaded, all three tools (`weather.now.raw`, `weather.city.lookup`, `weather.trip.advisor`) return real QWeather data when called through `pnpm mcp:client call-tool`.
- `weather.trip.advisor` produces checkpoint audit records visible via `mcphub://audit/recent` in the expected order: `geo_resolved`, `forecast_fetched`, `indices_fetched`, `astronomy_fetched`, `aggregated`.
- An invalid/missing API key produces a clear `PLUGIN_EXECUTION_ERROR` rather than an unhandled exception or raw QWeather error payload leaking to the caller.
