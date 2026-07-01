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
    },
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
  ],
  handlers: {
    async lookupWeather(input, context) {
      const city = input.city;
      const geo = await context.http.get("/geo/v2/city/lookup", { query: { location: city } });
      if (geo.code !== "200") {
        throw new Error(`QWeather geo/city/lookup returned error code ${geo.code} for city '${city}'.`);
      }
      if (!Array.isArray(geo.location) || geo.location.length === 0) {
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
    },

    async tripAdvisor(input, context) {
      const city = input.city;
      const days = input.days === 7 ? 7 : 3;

      const geo = await context.http.get("/geo/v2/city/lookup", { query: { location: city } });
      if (geo.code !== "200") {
        throw new Error(`QWeather geo/city/lookup returned error code ${geo.code} for city '${city}'.`);
      }
      if (!Array.isArray(geo.location) || geo.location.length === 0) {
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
  }
};

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
