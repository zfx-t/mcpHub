# QWeather Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real, working `qweather` example plugin under `examples/plugins/qweather/` that demonstrates task-oriented MCP tool design (curated multi-call orchestration) against a naive one-endpoint-per-tool contrast case, using the QWeather REST API.

**Architecture:** One MCPHub plugin manifest (`index.js`, ES module default export) following the exact pattern already used by `examples/plugins/fake-upload`. Three tools: one `defineApiTool()` declarative HTTP tool (`weather.now.raw`), and two `defineExecutorTool()` handlers that call `context.http.get()` multiple times and aggregate results (`weather.city.lookup`, `weather.trip.advisor`). No changes to any package under `packages/` or `apps/` — this plan only adds files under `examples/plugins/qweather/`, plus two short README entries.

**Tech Stack:** Existing MCPHub plugin SDK (`@mcphub/plugins` `defineApiTool`/`defineExecutorTool`/`definePlugin`), existing `PluginExecutorContext.http` helper, existing `api_key_header` credential type, existing `mcp:client` CLI and `plugin:verify` CLI for manual verification. No new dependencies.

## Global Constraints

- Tool names must match `<domain>.<resource>.<action>` (lowercase letters/digits per segment, 3+ segments, dot-separated) per `packages/core/src/plugin-standard.ts` `validateTools()`. Tool names in this plan: `weather.now.raw`, `weather.city.lookup`, `weather.trip.advisor`.
- Every tool must declare exactly one of `operation` or `executor`, never both, never neither (same validator).
- `inputSchema.type` must be `"object"` for every tool.
- All three tools use `effect: "read"` (per design doc — no write/dangerous operations against QWeather in this plugin).
- The declarative HTTP tool's non-path input fields are forwarded verbatim as query parameter names by `packages/mcp/src/gateway.ts` `requestForTool()`. This is why `weather.now.raw`'s input field is named `location`, matching QWeather's actual query parameter name — not `locationId` or any other alias.
- The `api_key_header` credential's `scope` field is the literal HTTP header name (verified against `packages/api-connector/src/connector.ts`, which does `headers.set(scope, credential.value)`). QWeather requires the header name `X-QW-Api-Key`.
- Do not modify any file under `packages/` or `apps/`. Do not add this plugin to `pnpm test`, `pnpm test:e2e`, or `pnpm test:plugin` — those must remain runnable without a live QWeather API key.
- Do not commit `.env` or any file containing the real `QWEATHER_API_KEY` value or the real API host. `.env` is already gitignored; verify before committing.

---

## File Structure

```
examples/plugins/qweather/
├── index.js               # Plugin manifest: metadata, credential, 3 tool definitions, 2 handlers
├── plugin.config.json     # Deployment config: baseUrl, credential binding, policy
└── README.md              # Plugin-local docs: what QWeather is, how to get a key, tool rationale
```

Two existing files get one short addition each:
- `README.md` (repo root) — one entry in the examples-plugins section, alongside the existing `fake-upload` entry.
- `README_cn.md` (repo root) — the Chinese equivalent.

No test files are created. Verification in this plan is manual (live API calls), consistent with the design doc's Testing Strategy section — this plugin is a demo artifact using a real external API, not something that belongs in the repo's credential-free automated suite.

---

### Task 1: Plugin manifest and declarative HTTP tool (`weather.now.raw`)

**Files:**
- Create: `examples/plugins/qweather/index.js` (initial version — extended in Tasks 2 and 3)
- Create: `examples/plugins/qweather/plugin.config.json`

**Interfaces:**
- Consumes: `definePlugin`, `defineApiTool`, `defineExecutorTool` from `@mcphub/plugins` (import path `"../../../packages/plugins/src/sdk.js"` is NOT used — local plugins are loaded as plain ES modules via dynamic `import()` by `packages/plugins/src/local-loader.ts`, exactly like `examples/plugins/fake-upload/index.js`, which imports nothing from `@mcphub/plugins` and instead exports a plain object literal matching the manifest shape directly. Follow that same plain-object-literal pattern — do NOT import `@mcphub/plugins` from this file.)
- Produces: default export matching `PluginManifest` shape (`id`, `name`, `version`, `type`, `description`, `mcphub`, `credentials`, `tools`, `handlers`), consumed by `packages/plugins/src/local-loader.ts` at runtime.

**Step 1: Confirm the plain-object manifest pattern used by `fake-upload`**

Read `examples/plugins/fake-upload/index.js`. Note it does NOT import `@mcphub/plugins` — it exports a plain object literal with `id`, `name`, `version`, `type`, `description`, `homepage`, `author`, `license`, `tags`, `mcphub`, `credentials`, `tools`, `handlers` fields directly. This is because local plugins are loaded via `pathToFileURL` + dynamic `import()` on the raw `index.js` file (see `packages/plugins/src/local-loader.ts` `loadPluginManifest()`), with no TypeScript/build step and no access to workspace package resolution from within `examples/plugins/`. This plan follows the same plain-object pattern.

**Step 2: Write `examples/plugins/qweather/index.js` with manifest metadata and the first tool**

```js
export default {
  id: "qweather",
  name: "QWeather",
  version: "0.1.0",
  type: "api",
  description: "Expose QWeather (和风天气) forecast data as curated MCP tools, contrasted with a raw one-to-one endpoint wrapper.",
  homepage: "https://dev.qweather.com",
  author: "MCPHub",
  license: "MIT",
  tags: ["weather", "example", "api"],
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["http", "executor", "credentials", "policy", "audit", "checkpoint", "plugin-config"]
  },
  credentials: [{ id: "qweather-key", type: "api_key_header", description: "QWeather X-QW-Api-Key header value." }],
  tools: [
    {
      name: "weather.now.raw",
      description: "Raw pass-through of QWeather's current-conditions endpoint. Requires an already-known QWeather numeric location id. Kept as an uncurated contrast case against weather.city.lookup and weather.trip.advisor.",
      inputSchema: {
        type: "object",
        required: ["location"],
        properties: {
          location: { type: "string", description: "QWeather numeric location id, e.g. 101010100." }
        }
      },
      effect: "read",
      credentialRefs: ["qweather-key"],
      operation: { type: "http", method: "GET", path: "/v7/weather/now" }
    }
  ],
  handlers: {}
};
```

**Step 3: Write `examples/plugins/qweather/plugin.config.json`**

```json
{
  "enabled": true,
  "config": {
    "baseUrl": "https://REPLACE_WITH_YOUR_QWEATHER_HOST"
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

This file is a checked-in template with a placeholder `baseUrl`. Real local testing overrides `baseUrl` via a local, gitignored copy or in-place edit before running — see Task 5's verification steps, which document overwriting this value locally without committing the real host. (QWeather API hosts are project-specific but not classified as secret by QWeather; still, keeping a placeholder in the committed file avoids baking any specific developer's host into the repo.)

**Step 4: Run static validation**

```bash
pnpm plugin:verify examples/plugins/qweather
```

Expected: `Standard: compatible`, `Warnings: 0`, `Errors: 0`, `Loaded local plugin qweather` (or equivalent success diagnostic). If this fails, fix `index.js`/`plugin.config.json` per the printed diagnostic before proceeding — do not continue to Task 2 with a failing manifest.

**Step 5: Commit**

```bash
git add examples/plugins/qweather/index.js examples/plugins/qweather/plugin.config.json
git commit -m "Add qweather plugin manifest with raw weather.now.raw tool"
```

---

### Task 2: `weather.city.lookup` executor tool (2-call orchestration)

**Files:**
- Modify: `examples/plugins/qweather/index.js`

**Interfaces:**
- Consumes: `context.http.get(path, { query })` returning `Promise<unknown>` (per `PluginExecutorContext.http` in `packages/plugins/src/sdk.ts`), `context.checkpoint(step, summary)` returning `Promise<void>`.
- Produces: `handlers.lookupWeather` function referenced by `tools[1].executor.handler`, consumed by `packages/mcp/src/executor-runtime.ts` at runtime. Output shape: `{ city, resolvedLocation: { id, name, adm1, adm2 }, now: { tempC, feelsLikeC, text, windDir, windScale, humidity } }`.

**Step 1: Add the `weather.city.lookup` tool definition to the `tools` array**

Insert after the `weather.now.raw` tool entry in `examples/plugins/qweather/index.js`:

```js
    {
      name: "weather.city.lookup",
      description: "Look up current weather for a city by name. Internally resolves the city name to a QWeather location id via geo lookup, then fetches current conditions — the caller only needs to provide a city name, not an opaque location id.",
      inputSchema: {
        type: "object",
        required: ["city"],
        properties: {
          city: { type: "string", description: "City name, e.g. 北京 or Beijing." }
        }
      },
      effect: "read",
      credentialRefs: ["qweather-key"],
      executor: { type: "module", handler: "lookupWeather" }
    }
```

**Step 2: Add the `lookupWeather` handler to the `handlers` object**

Replace the empty `handlers: {}` with:

```js
  handlers: {
    async lookupWeather(input, context) {
      const city = input.city;
      const geo = await context.http.get("/geo/v2/city/lookup", { query: { location: city } });
      if (geo.code !== "200" || !Array.isArray(geo.location) || geo.location.length === 0) {
        throw new Error(`No location found for city '${city}'.`);
      }
      const resolved = geo.location[0];
      await context.checkpoint("geo_resolved", { city, locationId: resolved.id, locationName: resolved.name });

      const weather = await context.http.get("/v7/weather/now", { query: { location: resolved.id } });
      if (weather.code !== "200") {
        throw new Error(`QWeather weather/now returned error code ${weather.code} for location ${resolved.id}.`);
      }
      await context.checkpoint("weather_fetched", { locationId: resolved.id });

      return {
        city,
        resolvedLocation: { id: resolved.id, name: resolved.name, adm1: resolved.adm1, adm2: resolved.adm2 },
        now: {
          tempC: Number(weather.now.temp),
          feelsLikeC: Number(weather.now.feelsLike),
          text: weather.now.text,
          windDir: weather.now.windDir,
          windScale: weather.now.windScale,
          humidity: Number(weather.now.humidity)
        }
      };
    }
  }
```

**Step 3: Static validation**

```bash
pnpm plugin:verify examples/plugins/qweather
```

Expected: still `Standard: compatible`, `Errors: 0`. This step only validates manifest shape and handler presence, not live behavior (no network call is made by `plugin:verify`).

**Step 4: Commit**

```bash
git add examples/plugins/qweather/index.js
git commit -m "Add weather.city.lookup orchestration tool to qweather plugin"
```

---

### Task 3: `weather.trip.advisor` executor tool (4-call orchestration, flagship)

**Files:**
- Modify: `examples/plugins/qweather/index.js`

**Interfaces:**
- Consumes: same `context.http.get()` / `context.checkpoint()` as Task 2.
- Produces: `handlers.tripAdvisor` function referenced by the new tool's `executor.handler`. Output shape: `{ city, resolvedLocation: { id, name }, days: [{ date, tempMaxC, tempMinC, condition, sportIndex, clothingIndex, uvIndex, sunrise, sunset }], summary }`.

**Step 1: Add the `weather.trip.advisor` tool definition**

Insert after `weather.city.lookup` in the `tools` array:

```js
    {
      name: "weather.trip.advisor",
      description: "Produce an outdoor-activity advisory for a city over the next 3 or 7 days. Internally orchestrates geo lookup, multi-day forecast, life indices (sport/clothing/UV), and sunrise/sunset — the caller gets one structured, human-readable advisory instead of having to call and cross-reference four separate QWeather endpoints itself.",
      inputSchema: {
        type: "object",
        required: ["city"],
        properties: {
          city: { type: "string", description: "City name, e.g. 北京 or Beijing." },
          days: { type: "number", enum: [3, 7], description: "Forecast horizon in days. Defaults to 3." }
        }
      },
      effect: "read",
      credentialRefs: ["qweather-key"],
      executor: { type: "module", handler: "tripAdvisor" }
    }
```

**Step 2: Add the `tripAdvisor` handler**

Add to the `handlers` object, after `lookupWeather`:

```js
    async tripAdvisor(input, context) {
      const city = input.city;
      const days = input.days === 7 ? 7 : 3;

      const geo = await context.http.get("/geo/v2/city/lookup", { query: { location: city } });
      if (geo.code !== "200" || !Array.isArray(geo.location) || geo.location.length === 0) {
        throw new Error(`No location found for city '${city}'.`);
      }
      const resolved = geo.location[0];
      await context.checkpoint("geo_resolved", { city, locationId: resolved.id, locationName: resolved.name });

      const forecast = await context.http.get(`/v7/weather/${days}d`, { query: { location: resolved.id } });
      if (forecast.code !== "200") {
        throw new Error(`QWeather weather/${days}d returned error code ${forecast.code} for location ${resolved.id}.`);
      }
      await context.checkpoint("forecast_fetched", { locationId: resolved.id, days });

      const indices = await context.http.get("/v7/indices/1d", { query: { location: resolved.id, type: "1,3,5" } });
      if (indices.code !== "200") {
        throw new Error(`QWeather indices/1d returned error code ${indices.code} for location ${resolved.id}.`);
      }
      await context.checkpoint("indices_fetched", { locationId: resolved.id });

      const todayDate = forecast.daily[0].fxDate.replace(/-/g, "");
      const astronomy = await context.http.get("/v7/astronomy/sun", { query: { location: resolved.id, date: todayDate } });
      if (astronomy.code !== "200") {
        throw new Error(`QWeather astronomy/sun returned error code ${astronomy.code} for location ${resolved.id}.`);
      }
      await context.checkpoint("astronomy_fetched", { locationId: resolved.id });

      const indexByType = Object.fromEntries(indices.daily.map((entry) => [entry.type, entry]));

      const dayAdvisories = forecast.daily.map((day) => ({
        date: day.fxDate,
        tempMaxC: Number(day.tempMax),
        tempMinC: Number(day.tempMin),
        condition: day.textDay,
        sportIndex: indexByType["1"] ? { level: indexByType["1"].level, category: indexByType["1"].category } : undefined,
        clothingIndex: indexByType["3"] ? { level: indexByType["3"].level, category: indexByType["3"].category } : undefined,
        uvIndex: indexByType["5"] ? { level: indexByType["5"].level, category: indexByType["5"].category } : undefined,
        sunrise: day.sunrise,
        sunset: day.sunset
      }));

      const summary = buildSummary(dayAdvisories);
      await context.checkpoint("aggregated", { city, dayCount: dayAdvisories.length });

      return {
        city,
        resolvedLocation: { id: resolved.id, name: resolved.name },
        days: dayAdvisories,
        summary
      };
    }
```

**Step 3: Add the `buildSummary` helper function**

Add as a module-level function in `examples/plugins/qweather/index.js`, outside the default export (functions referenced by `handlers` must themselves be inside the exported object per `readPluginHandlers()` in `packages/plugins/src/local-loader.ts`, but plain helper functions they call can live at module scope):

```js
function buildSummary(days) {
  const notes = [];
  for (const day of days) {
    if (/雨|雪/.test(day.condition)) {
      notes.push(`${day.date} 有${day.condition.includes("雪") ? "降雪" : "降雨"}，建议室内活动`);
    }
    if (day.uvIndex && Number(day.uvIndex.level) >= 8) {
      notes.push(`${day.date} 紫外线强（等级 ${day.uvIndex.level}），户外需防晒`);
    }
    if (day.tempMaxC >= 35) {
      notes.push(`${day.date} 最高温 ${day.tempMaxC}°C，注意防暑`);
    }
  }
  if (notes.length === 0) {
    return "未来几天天气整体温和，适合户外活动。";
  }
  return notes.join("；") + "。";
}
```

Place this function definition above `export default { ... }` in the file, since it's referenced by `tripAdvisor` inside the `handlers` object.

**Step 4: Static validation**

```bash
pnpm plugin:verify examples/plugins/qweather
```

Expected: `Standard: compatible`, `Errors: 0`.

**Step 5: Commit**

```bash
git add examples/plugins/qweather/index.js
git commit -m "Add weather.trip.advisor flagship orchestration tool to qweather plugin"
```

---

### Task 4: Plugin-local README

**Files:**
- Create: `examples/plugins/qweather/README.md`

**Interfaces:**
- Consumes: nothing (documentation only).
- Produces: nothing consumed by code; referenced by Task 5's root README updates.

**Step 1: Write `examples/plugins/qweather/README.md`**

```markdown
# QWeather Plugin

A real, working MCPHub example plugin backed by the [QWeather](https://dev.qweather.com) (和风天气) REST API. It demonstrates the difference between wrapping an API's endpoints one-to-one and curating them into task-oriented tools an agent can use directly.

## Why this plugin exists

If you map every REST endpoint in an OpenAPI document to one MCP tool, you get a large, undifferentiated tool list that an LLM has to reason about at call time — including endpoints that require IDs the caller doesn't have yet (like QWeather's numeric location ids, which require a separate geocoding call to resolve). This plugin ships one deliberately uncurated tool (`weather.now.raw`) next to two curated, multi-call orchestration tools (`weather.city.lookup`, `weather.trip.advisor`) to make that contrast concrete.

## Get a QWeather API key

1. Register at [dev.qweather.com](https://dev.qweather.com).
2. In the console, create a project and choose the free subscription.
3. Add a credential of type **API KEY** (not JWT) to the project.
4. Note your API key and your project's API host (e.g. `xxxxxxxxx.qweatherapi.com`).

The free tier covers current conditions, multi-day forecasts, life indices, geo lookup, and astronomy data — all the endpoints this plugin uses. It does **not** cover air quality, weather alerts, or minutely precipitation; this plugin does not use those endpoints for that reason.

## Configure

Edit `plugin.config.json` and set `config.baseUrl` to `https://<your-project-host>`. Export the API key before starting MCPHub:

```bash
export QWEATHER_API_KEY=your-real-key
```

## Tools

| Tool | Style | What it does |
|---|---|---|
| `weather.now.raw` | Declarative HTTP, uncurated | Direct pass-through of `GET /v7/weather/now`. Requires an already-known numeric `location` id. This is the "before" example. |
| `weather.city.lookup` | Executor, 2-call orchestration | Takes a city name, resolves it to a location id via geo lookup, then fetches current conditions. One call in, one structured result out. |
| `weather.trip.advisor` | Executor, 4-call orchestration | Takes a city name and a day count (3 or 7), orchestrates forecast + life indices + astronomy calls, and returns a per-day advisory plus a one-line natural-language summary. |

## Try it

```bash
MCPHUB_PLUGIN_DIR=examples/plugins QWEATHER_API_KEY=your-real-key pnpm dev
```

In another terminal:

```bash
pnpm mcp:client --url http://127.0.0.1:3000/mcp call-tool --name weather.city.lookup --args '{"city":"北京"}'
pnpm mcp:client --url http://127.0.0.1:3000/mcp call-tool --name weather.trip.advisor --args '{"city":"北京","days":3}'
```
```

**Step 2: Commit**

```bash
git add examples/plugins/qweather/README.md
git commit -m "Add qweather plugin README"
```

---

### Task 5: Live manual verification against the real QWeather API

**Files:** none created or modified — this task is verification only, run locally, not committed.

**Interfaces:** none.

**Step 1: Set up a local, uncommitted override of `plugin.config.json` with the real host**

Do not edit the committed `examples/plugins/qweather/plugin.config.json` with a real host value. Instead, copy the example plugin directory into a gitignored scratch location for live testing:

```bash
mkdir -p /tmp/mcphub-qweather-live
cp -r examples/plugins/qweather /tmp/mcphub-qweather-live/
```

Edit `/tmp/mcphub-qweather-live/qweather/plugin.config.json`, replacing `"baseUrl": "https://REPLACE_WITH_YOUR_QWEATHER_HOST"` with your real host, e.g. `"baseUrl": "https://n86yw34yt3.re.qweatherapi.com"`.

**Step 2: Start the dev server pointed at the scratch plugin directory**

```bash
PORT=3099 REQUEST_LOGGING=false MCPHUB_PLUGIN_DIR=/tmp/mcphub-qweather-live QWEATHER_API_KEY=your-real-key pnpm dev
```

Confirm the startup log includes a line like `[mcphub] loaded_plugin ... Loaded local plugin qweather.` with no error diagnostics. If a diagnostic appears, stop and fix it before proceeding — do not treat a plugin load failure as acceptable for this task.

**Step 3: Confirm the plugin is visible via `/api/status`**

In another terminal:

```bash
curl -fsS http://127.0.0.1:3099/api/status
```

Expected: `plugins.loaded` is at least `1`, `mcp.tools.names` includes `weather.now.raw`, `weather.city.lookup`, `weather.trip.advisor`.

**Step 4: Call `weather.city.lookup` with a real city name**

```bash
pnpm mcp:client --url http://127.0.0.1:3099/mcp call-tool --name weather.city.lookup --args '{"city":"北京"}'
```

Expected: JSON content with `resolvedLocation.id` set to a real QWeather location id (e.g. `101010100`) and a `now` object with real-looking `tempC`/`text`/`humidity` values, not an error payload.

**Step 5: Call `weather.trip.advisor` with a real city name and both day counts**

```bash
pnpm mcp:client --url http://127.0.0.1:3099/mcp call-tool --name weather.trip.advisor --args '{"city":"北京","days":3}'
pnpm mcp:client --url http://127.0.0.1:3099/mcp call-tool --name weather.trip.advisor --args '{"city":"上海","days":7}'
```

Expected: both calls return a `days` array of the requested length with real forecast data and a non-empty `summary` string.

**Step 6: Call `weather.now.raw` with a location id obtained from Step 4**

```bash
pnpm mcp:client --url http://127.0.0.1:3099/mcp call-tool --name weather.now.raw --args '{"location":"101010100"}'
```

Expected: raw QWeather `now` payload (fields like `temp`, `feelsLike`, `humidity` as strings, unmodified from the QWeather response shape) — confirm this looks visibly less structured than `weather.city.lookup`'s output, which is the point of keeping it as the contrast case.

**Step 7: Confirm checkpoint audit trail for `weather.trip.advisor`**

```bash
pnpm mcp:client --url http://127.0.0.1:3099/mcp read-resource --uri mcphub://audit/recent
```

Expected: records showing `_checkpointStep` values `geo_resolved`, `forecast_fetched`, `indices_fetched`, `astronomy_fetched`, `aggregated` for the `weather.trip.advisor` tool calls made in Step 5, each with `pluginId: "qweather"`.

**Step 8: Confirm error handling for an invalid city**

```bash
pnpm mcp:client --url http://127.0.0.1:3099/mcp call-tool --name weather.city.lookup --args '{"city":"xyznotarealcityname"}'
```

Expected: an error result (not an unhandled exception, not a raw QWeather payload) — the tool call response should be an MCP error/`isError: true` result whose message reflects the "No location found" error thrown in the handler.

**Step 9: Confirm error handling for an invalid API key**

Stop the running server (Ctrl-C), then restart it with a deliberately wrong key:

```bash
PORT=3099 REQUEST_LOGGING=false MCPHUB_PLUGIN_DIR=/tmp/mcphub-qweather-live QWEATHER_API_KEY=invalid-key-value pnpm dev
```

In another terminal:

```bash
pnpm mcp:client --url http://127.0.0.1:3099/mcp call-tool --name weather.city.lookup --args '{"city":"北京"}'
```

Expected: an MCP error result whose message reports a `PLUGIN_EXECUTION_ERROR` (surfaced from the handler's `Error` thrown on a non-`"200"` QWeather response code), not a raw QWeather error payload leaking through and not an unhandled exception/connection drop. Stop this server before continuing.

**Step 10: Stop the server and clean up**

```bash
# Ctrl-C the running `pnpm dev` process, or:
pkill -f "MCPHUB_PLUGIN_DIR=/tmp/mcphub-qweather-live"
rm -rf /tmp/mcphub-qweather-live
```

**Step 11: Confirm the repo working tree has no leaked secrets**

```bash
git status
git diff -- examples/plugins/qweather/plugin.config.json
```

Expected: `plugin.config.json` still shows the placeholder `REPLACE_WITH_YOUR_QWEATHER_HOST` value, no diff. `git status` shows no untracked `.env` or credential files.

No commit in this task — it is verification only, using a scratch directory outside the repo.

---

### Task 6: Root README entries

**Files:**
- Modify: `README.md:271` (immediately after the existing `examples/plugins/fake-upload/` reference block, per the section shown in the read excerpt during design review — search for `examples/plugins/fake-upload/` if the line number has shifted)
- Modify: `README_cn.md:269` (same, Chinese file)

**Interfaces:** none — documentation only.

**Step 1: Add an entry to `README.md`**

Locate the existing block:

```text
A runnable executor demo is available in:

​```text
examples/plugins/fake-upload/
​```

Verify it end to end:

​```bash
pnpm test:plugin
​```
```

Immediately after that block (before the `## Tool Policy` heading), add:

```markdown
A second example plugin backed by a real external API (QWeather) is available in:

```text
examples/plugins/qweather/
```

It contrasts a naive one-endpoint-per-tool wrapper with two curated, multi-call orchestration tools. See `examples/plugins/qweather/README.md` for setup and usage — it requires a free QWeather API key and is not part of the credential-free `pnpm test:plugin` suite.
```

**Step 2: Add the equivalent entry to `README_cn.md`**

Locate the equivalent Chinese block around `examples/plugins/fake-upload/` and `pnpm test:plugin`, and add immediately after it:

```markdown
另一个基于真实外部 API（和风天气）的示例插件位于：

```text
examples/plugins/qweather/
```

它对比展示了"未裁剪的单接口映射工具"和"裁剪后的多步编排工具"。使用说明见 `examples/plugins/qweather/README.md`，需要免费的和风天气 API Key，不包含在无需凭据的 `pnpm test:plugin` 套件中。
```

**Step 3: Confirm root workspace checks still pass**

```bash
pnpm lint
pnpm typecheck
```

Expected: both pass unchanged — this task only touches Markdown files, but running these confirms nothing else in the working tree was accidentally left in a broken state from earlier tasks.

**Step 4: Commit**

```bash
git add README.md README_cn.md
git commit -m "Document qweather example plugin in root README"
```

---

### Task 7: Full regression check and final review

**Files:** none modified — verification only.

**Step 1: Run the full existing verification suite to confirm no regression**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm test:plugin
pnpm build
```

Expected: all pass, identical to the pre-existing baseline (this plugin is never loaded by any of these commands, so their output should be byte-for-byte the same set of passes as before Task 1).

**Step 2: Run plugin standard verification one more time**

```bash
pnpm plugin:verify examples/plugins/qweather
```

Expected: `Standard: compatible`, `Warnings: 0`, `Errors: 0`.

**Step 3: Review the full diff for accidental secret leakage**

```bash
git log --oneline -8
git diff main -- examples/plugins/qweather/plugin.config.json
```

Expected: `plugin.config.json` diff (against whatever base this branch started from) shows only the placeholder host, never a real QWeather host or key.

**Step 4: Confirm final file listing**

```bash
git ls-files examples/plugins/qweather/
```

Expected:
```
examples/plugins/qweather/README.md
examples/plugins/qweather/index.js
examples/plugins/qweather/plugin.config.json
```

No commit needed for this task if all checks pass — it is a final confirmation step. If anything fails, fix it and add a follow-up commit before considering the plan complete.
