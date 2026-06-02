import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { detectSource, detectSiteRequestSchema } from "@mcphub/core";
import type { McpHubRepository } from "@mcphub/db";
import { createSdkMcpServer } from "@mcphub/mcp";
import type { PlatformGatewayOptions } from "@mcphub/mcp";
import type { ExtractionService } from "@mcphub/extractors";
import type { ServerConfig } from "./config.js";

export function createApp(input: {
  repository: McpHubRepository;
  extraction: ExtractionService;
  config: ServerConfig;
  platform?: PlatformGatewayOptions;
}) {
  const app = Fastify({
    logger: input.config.requestLogging ? { level: "info" } : false,
    genReqId: () => randomUUID()
  });
  const rateLimiter = createRateLimiter(input.config.fetchRateLimitPerMinute);

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    const url = request.raw.url ?? "";
    if ((url.startsWith("/api/detect-site") || url.startsWith("/mcp")) && !rateLimiter.allow(request.ip)) {
      return reply.code(429).send({
        status: "error",
        code: "RATE_LIMITED",
        message: "Rate limit reached."
      });
    }
  });

  app.get("/healthz", async () => ({
    ok: true,
    service: "mcphub",
    version: "0.1.0"
  }));

  app.post("/api/detect-site", async (request, reply) => {
    const parsed = detectSiteRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        status: "error",
        message: "Invalid detection request.",
        issues: parsed.error.issues
      });
    }
    const sources = await input.repository.listSources();
    return detectSource(parsed.data, sources, { mcpServerUrl: input.config.mcpServerUrl });
  });

  app.all("/mcp", async (request, reply) => {
    const server = createSdkMcpServer(input.repository, input.extraction, input.platform);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(request.raw, reply.raw, request.body);
    reply.hijack();
  });

  return app;
}

function createRateLimiter(limitPerMinute: number) {
  const counters = new Map<string, { windowStart: number; count: number }>();
  return {
    allow(key: string): boolean {
      const now = Date.now();
      const current = counters.get(key);
      if (!current || now - current.windowStart > 60_000) {
        counters.set(key, { windowStart: now, count: 1 });
        return true;
      }
      current.count += 1;
      return current.count <= limitPerMinute;
    }
  };
}
