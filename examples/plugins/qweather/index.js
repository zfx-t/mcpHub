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
