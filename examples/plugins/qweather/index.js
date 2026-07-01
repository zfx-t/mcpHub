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
    },
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
  ],
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
};
