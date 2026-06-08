import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { AuditLogger } from "@mcphub/audit";
import { createSeedRepository } from "@mcphub/db";
import type { McpHubRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import { PluginRegistry, sampleAdminPlugin } from "@mcphub/plugins";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createPlatformServices } from "./platform.js";

describe("server app", () => {
  it("detects supported and restricted sites", async () => {
    const repo = createSeedRepository();
    const app = createApp({
      repository: repo,
      extraction: new ExtractionService(repo, new FixtureFetcher({})),
      config: loadConfig({
        PUBLIC_BASE_URL: "http://localhost:3000",
        MCP_SERVER_URL: "http://localhost:3000/mcp",
        REQUEST_LOGGING: "false"
      })
    });

    const supported = await app.inject({
      method: "POST",
      url: "/api/detect-site",
      payload: { url: "https://example.com/articles/hello", hostname: "example.com" }
    });
    expect(supported.statusCode).toBe(200);
    expect(supported.json()).toMatchObject({ status: "available", sourceId: "src_example_articles" });

    const restricted = await app.inject({
      method: "POST",
      url: "/api/detect-site",
      payload: { url: "https://private.example.org/docs/a", hostname: "private.example.org" }
    });
    expect(restricted.json()).toMatchObject({ status: "restricted" });
  });

  it("handles MCP JSON-RPC tool calls", async () => {
    const repo = createSeedRepository();
    const app = createApp({
      repository: repo,
      extraction: new ExtractionService(
        repo,
        new FixtureFetcher({
          "https://example.com/": `<article><h1>Hello MCP</h1><p>${"Content. ".repeat(30)}</p></article>`
        })
      ),
      config: loadConfig({ REQUEST_LOGGING: "false" })
    });

    await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { accept: "application/json, text/event-stream" },
      payload: {
        jsonrpc: "2.0",
        id: 0,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "test", version: "0.1.0" }
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { accept: "application/json, text/event-stream" },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "source.refresh", arguments: { sourceId: "src_example_articles", mode: "force" } }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("cacheStatus");
    await expect(repo.listItems("src_example_articles")).resolves.toHaveLength(1);
  });

  it("lists sample admin plugin tools through the SDK MCP transport", async () => {
    const repo = createSeedRepository();
    const app = createApp({
      repository: repo,
      extraction: new ExtractionService(repo, new FixtureFetcher({})),
      config: loadConfig({ REQUEST_LOGGING: "false" }),
      platform: { registry: new PluginRegistry([sampleAdminPlugin]) }
    });

    await initializeMcp(app);
    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { accept: "application/json, text/event-stream" },
      payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("admin.users.list");
    expect(response.body).toContain("admin.users.disable");
  });

  it("bootstraps the sample admin plugin from server config", async () => {
    const repo = createSeedRepository();
    const config = loadConfig({
      REQUEST_LOGGING: "false",
      SAMPLE_ADMIN_API_BASE_URL: "https://admin.local",
      SAMPLE_ADMIN_API_TOKEN_ENV: "ADMIN_TOKEN"
    });

    const platform = await createPlatformServices({ repository: repo, config, env: { ADMIN_TOKEN: "secret" } });

    expect(platform?.registry?.getManifest("sample-admin")).toBeDefined();
    await expect(repo.getPlugin("sample-admin")).resolves.toMatchObject({ config: { baseUrl: "https://admin.local" } });
    await expect(repo.getCredentialForRequirement("sample-admin", "admin-token")).resolves.toMatchObject({
      secretRef: "env:ADMIN_TOKEN"
    });
    expect(platform?.pluginMetadata?.["sample-admin"]).toEqual({
      source: "built_in",
      credentials: [{ id: "admin-token", type: "bearer", configured: true }]
    });
  });

  it("preserves sample admin tool arguments through the SDK MCP transport", async () => {
    const repo = createSeedRepository();
    const config = loadConfig({
      REQUEST_LOGGING: "false",
      SAMPLE_ADMIN_API_BASE_URL: "https://admin.local",
      SAMPLE_ADMIN_API_TOKEN_ENV: "ADMIN_TOKEN"
    });
    const platform = await createPlatformServices({ repository: repo, config, env: { ADMIN_TOKEN: "secret" } });
    const app = createApp({
      repository: repo,
      extraction: new ExtractionService(repo, new FixtureFetcher({})),
      config,
      platform: {
        ...platform,
        auditLogger: new AuditLogger({ repository: repo }),
        pluginPolicies: { ...(platform?.pluginPolicies ?? {}), "sample-admin": { dangerousMode: "block" } }
      }
    });

    await initializeMcp(app);
    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: { accept: "application/json, text/event-stream" },
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "admin.users.disable", arguments: { id: "user-1" } }
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("CONFIRMATION_REQUIRED");
    await expect(repo.listAuditRecords({ toolName: "admin.users.disable" })).resolves.toEqual([
      expect.objectContaining({
        target: "https://admin.local/api/users/user-1/disable",
        inputSummary: expect.objectContaining({ id: "user-1", _policyMode: "block" })
      })
    ]);
  });

  it("loads local plugins from MCPHUB_PLUGIN_DIR into platform services", async () => {
    const repo = createSeedRepository();
    const pluginDir = await mkdtemp(path.join(os.tmpdir(), "mcphub-app-local-"));
    try {
      const fixturePath = path.join(pluginDir, "local-admin");
      await mkdir(fixturePath, { recursive: true });
      await writeFile(path.join(fixturePath, "index.js"), localPluginModuleSource("local-admin", "local.admin"));
      await writeFile(
        path.join(fixturePath, "plugin.config.json"),
        JSON.stringify(
          {
            enabled: true,
            config: { baseUrl: "https://admin.local" },
            credentials: { "admin-token": { type: "bearer", secretRef: "env:LOCAL_ADMIN_TOKEN" } },
            policy: { dangerousMode: "allow" }
          },
          null,
          2
        )
      );

      const config = loadConfig({
        REQUEST_LOGGING: "false",
        MCPHUB_PLUGIN_DIR: pluginDir
      });
      const platform = await createPlatformServices({ repository: repo, config, env: { LOCAL_ADMIN_TOKEN: "secret" } });

      expect(platform?.registry?.getManifest("local-admin")).toBeDefined();
      expect(platform?.pluginPolicies?.["local-admin"]).toEqual({ dangerousMode: "allow" });
      expect(platform?.pluginMetadata?.["local-admin"]).toMatchObject({
        source: "local",
        credentials: [{ id: "admin-token", type: "bearer", configured: true }]
      });
      await expect(repo.getPlugin("local-admin")).resolves.toMatchObject({ config: { baseUrl: "https://admin.local" } });
    } finally {
      await rm(pluginDir, { recursive: true, force: true });
    }
  });

  it("exposes platform status and plugin diagnostics over HTTP", async () => {
    const repo = createSeedRepository();
    const pluginDir = await mkdtemp(path.join(os.tmpdir(), "mcphub-app-status-"));
    try {
      const validPath = path.join(pluginDir, "local-admin");
      await mkdir(validPath, { recursive: true });
      await writeFile(path.join(validPath, "index.js"), localPluginModuleSource("local-admin", "local.admin"));
      await writeFile(
        path.join(validPath, "plugin.config.json"),
        JSON.stringify(
          {
            enabled: true,
            config: { baseUrl: "https://admin.local" },
            credentials: { "admin-token": { type: "bearer", secretRef: "env:LOCAL_ADMIN_TOKEN" } },
            policy: { dangerousMode: "auditOnly" }
          },
          null,
          2
        )
      );
      const disabledPath = path.join(pluginDir, "disabled-admin");
      await mkdir(disabledPath, { recursive: true });
      await writeFile(path.join(disabledPath, "index.js"), localPluginModuleSource("disabled-admin", "disabled.admin"));
      await writeFile(path.join(disabledPath, "plugin.config.json"), JSON.stringify({ enabled: false }, null, 2));
      await mkdir(path.join(pluginDir, "broken-admin"), { recursive: true });

      const config = loadConfig({
        REQUEST_LOGGING: "false",
        MCPHUB_PLUGIN_DIR: pluginDir
      });
      const platform = await createPlatformServices({ repository: repo, config, env: { LOCAL_ADMIN_TOKEN: "secret-value" } });
      const app = createApp({
        repository: repo,
        extraction: new ExtractionService(repo, new FixtureFetcher({})),
        config,
        platform
      });

      const statusResponse = await app.inject({ method: "GET", url: "/api/status" });
      expect(statusResponse.statusCode).toBe(200);
      const status = statusResponse.json() as {
        service: string;
        repository: { mode: string; databaseConfigured: boolean };
        plugins: { directoryConfigured: boolean; loaded: number; disabled: number; diagnostics: number };
        mcp: { resources: { uris: string[] }; tools: { names: string[]; pluginTools: Array<{ name: string; execution: string }> } };
      };
      expect(status).toMatchObject({
        service: "mcphub",
        repository: { mode: "memory", databaseConfigured: false },
        plugins: { directoryConfigured: true, loaded: 1, disabled: 1 }
      });
      expect(status.plugins.diagnostics).toBeGreaterThanOrEqual(3);
      expect(status.mcp.resources.uris).toContain("mcphub://status");
      expect(status.mcp.tools.names).toContain("local.admin.users.list");
      expect(status.mcp.tools.pluginTools).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: "local.admin.users.list", execution: "http" })])
      );
      expect(statusResponse.body).not.toContain("secret-value");

      const pluginsResponse = await app.inject({ method: "GET", url: "/api/plugins" });
      expect(pluginsResponse.statusCode).toBe(200);
      expect(pluginsResponse.body).toContain("local-admin");
      expect(pluginsResponse.body).toContain("disabled_plugin");
      expect(pluginsResponse.body).toContain("missing_entrypoint");
      expect(pluginsResponse.body).toContain("mcphub-app-status-");
      expect(pluginsResponse.body).not.toContain(pluginDir);
      expect(pluginsResponse.body).not.toContain("secret-value");
    } finally {
      await rm(pluginDir, { recursive: true, force: true });
    }
  });

  it("returns degraded status when the configured repository health check fails", async () => {
    const repo = createSeedRepository();
    const failingRepo = Object.assign(Object.create(repo), {
      listSources: async () => {
        throw new Error("database unavailable");
      }
    }) as McpHubRepository;
    const app = createApp({
      repository: failingRepo,
      extraction: new ExtractionService(failingRepo, new FixtureFetcher({})),
      config: loadConfig({
        REQUEST_LOGGING: "false",
        DATABASE_URL: "postgres://mcphub:mcphub@localhost:5432/mcphub"
      }),
      platform: {
        runtime: {
          repositoryMode: "postgres",
          databaseConfigured: true
        }
      }
    });

    const response = await app.inject({ method: "GET", url: "/api/status" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      status: "degraded",
      repository: { mode: "postgres", databaseConfigured: true, databaseHealthy: false }
    });
  });
});

async function initializeMcp(app: FastifyInstance): Promise<void> {
  await app.inject({
    method: "POST",
    url: "/mcp",
    headers: { accept: "application/json, text/event-stream" },
    payload: {
      jsonrpc: "2.0",
      id: 0,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "0.1.0" }
      }
    }
  });
}

function localPluginModuleSource(pluginId: string, toolPrefix: string): string {
  return `export default {
  id: "${pluginId}",
  name: "${pluginId}",
  version: "0.1.0",
  type: "api",
  description: "Local plugin fixture",
  credentials: [{ id: "admin-token", type: "bearer" }],
  tools: [
    {
      name: "${toolPrefix}.users.list",
      description: "List users",
      inputSchema: { type: "object", properties: { page: { type: "number" } } },
      effect: "read",
      credentialRefs: ["admin-token"],
      operation: { type: "http", method: "GET", path: "/api/users" }
    },
    {
      name: "${toolPrefix}.users.disable",
      description: "Disable user",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      effect: "dangerous",
      credentialRefs: ["admin-token"],
      operation: { type: "http", method: "POST", path: "/api/users/{id}/disable" }
    }
  ]
};
`;
}
