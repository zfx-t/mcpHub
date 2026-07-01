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
