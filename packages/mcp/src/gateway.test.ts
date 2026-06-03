import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogger } from "@mcphub/audit";
import { EnvironmentCredentialStore } from "@mcphub/credentials";
import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import {
  defineExecutorTool,
  definePlugin,
  PluginRegistry,
  pluginRecordFromManifest,
  pluginToolsFromManifest,
  sampleAdminPlugin
} from "@mcphub/plugins";
import { WebMcpGateway } from "./index.js";

const fixtureHtml = `
  <html>
    <head><title>Hello</title><link rel="canonical" href="https://example.com/"></head>
    <body><article><h1>Hello MCP</h1><p>${"Gateway article content. ".repeat(20)}</p></article></body>
  </html>
`;

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
    server = undefined;
  }
});

describe("WebMcpGateway", () => {
  it("lists and reads sources", async () => {
    const repo = createSeedRepository();
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})));

    expect(gateway.listResources()).toContainEqual(expect.objectContaining({ uri: "webmcp://sources" }));
    await expect(gateway.readResource("webmcp://sources")).resolves.toEqual([
      expect.objectContaining({ mimeType: "application/json" })
    ]);
  });

  it("refreshes sources through tools and reads items", async () => {
    const repo = createSeedRepository();
    const service = new ExtractionService(repo, new FixtureFetcher({ "https://example.com/": fixtureHtml }));
    const gateway = new WebMcpGateway(repo, service);

    await gateway.callTool("source.refresh", { sourceId: "src_example_articles", mode: "force" });
    const items = await repo.listItems("src_example_articles");

    expect(items).toHaveLength(1);
    await expect(gateway.readResource(`webmcp://items/${items[0].id}`)).resolves.toEqual([
      expect.objectContaining({ text: expect.stringContaining("Hello MCP") })
    ]);
  });

  it("aggregates API plugin tools, executes read calls, blocks dangerous calls, and exposes audit resources", async () => {
    let disableCalls = 0;
    const baseUrl = await startFixtureServer(async (request, response) => {
      if (request.url?.startsWith("/api/users") && request.method === "GET") {
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ users: [{ id: "user-1", name: "Ada" }], authorization: request.headers.authorization }));
        return;
      }
      if (request.url?.startsWith("/api/users/user-1/disable")) {
        disableCalls += 1;
        response.statusCode = 204;
        response.end();
        return;
      }
      response.statusCode = 404;
      response.end("not found");
    });
    const repo = createSeedRepository();
    await repo.upsertPlugin({ ...pluginRecordFromManifest(sampleAdminPlugin), config: { baseUrl } });
    for (const tool of pluginToolsFromManifest(sampleAdminPlugin)) {
      await repo.upsertPluginTool(tool);
    }
    await repo.upsertCredential({
      id: "cred_sample_admin_token",
      pluginId: "sample-admin",
      requirementId: "admin-token",
      name: "Sample admin token",
      type: "bearer",
      secretRef: "env:ADMIN_TOKEN"
    });
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})), {
      registry: new PluginRegistry([sampleAdminPlugin]),
      credentialStore: new EnvironmentCredentialStore({ env: { ADMIN_TOKEN: "secret-token" } }),
      auditLogger: new AuditLogger({ repository: repo }),
      pluginPolicies: { "sample-admin": { dangerousMode: "block" } },
      pluginMetadata: {
        "sample-admin": {
          source: "built_in",
          credentials: [{ id: "admin-token", type: "bearer", configured: true }]
        }
      }
    });

    expect(gateway.listTools()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "admin.users.list" })]));
    await expect(gateway.readResource("mcphub://plugins/sample-admin/tools")).resolves.toEqual([
      expect.objectContaining({ text: expect.stringContaining("admin.users.disable") })
    ]);
    await expect(gateway.readResource("mcphub://plugins")).resolves.toEqual([
      expect.objectContaining({ text: expect.stringContaining('"source": "built_in"') })
    ]);

    const listResult = JSON.parse((await gateway.callTool("admin.users.list", { page: 1 }))[0].text) as {
      ok: boolean;
      data: { users: Array<{ id: string }>; authorization: string };
    };
    expect(listResult).toMatchObject({
      ok: true,
      data: { users: [{ id: "user-1" }], authorization: "Bearer secret-token" }
    });

    const disableResult = JSON.parse((await gateway.callTool("admin.users.disable", { id: "user-1" }))[0].text) as {
      ok: boolean;
      error: { code: string };
    };
    expect(disableResult).toMatchObject({ ok: false, error: { code: "CONFIRMATION_REQUIRED" } });
    expect(disableCalls).toBe(0);
    await expect(gateway.readResource("mcphub://audit/recent")).resolves.toEqual([
      expect.objectContaining({ text: expect.stringContaining("CONFIRMATION_REQUIRED") })
    ]);
  });

  it("executes dangerous tools under auditOnly and records policy evidence", async () => {
    let disableCalls = 0;
    const baseUrl = await startFixtureServer(async (request, response) => {
      if (request.url?.startsWith("/api/users/user-1/disable")) {
        disableCalls += 1;
        response.statusCode = 204;
        response.end();
        return;
      }
      response.statusCode = 404;
      response.end("not found");
    });
    const repo = createSeedRepository();
    await repo.upsertPlugin({ ...pluginRecordFromManifest(sampleAdminPlugin), config: { baseUrl } });
    for (const tool of pluginToolsFromManifest(sampleAdminPlugin)) {
      await repo.upsertPluginTool(tool);
    }
    await repo.upsertCredential({
      id: "cred_sample_admin_token",
      pluginId: "sample-admin",
      requirementId: "admin-token",
      name: "Sample admin token",
      type: "bearer",
      secretRef: "env:ADMIN_TOKEN"
    });
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})), {
      registry: new PluginRegistry([sampleAdminPlugin]),
      credentialStore: new EnvironmentCredentialStore({ env: { ADMIN_TOKEN: "secret-token" } }),
      auditLogger: new AuditLogger({ repository: repo }),
      pluginPolicies: { "sample-admin": { dangerousMode: "auditOnly" } }
    });

    const disableResult = JSON.parse((await gateway.callTool("admin.users.disable", { id: "user-1" }))[0].text) as {
      ok: boolean;
    };

    expect(disableResult).toMatchObject({ ok: true });
    expect(disableCalls).toBe(1);
    await expect(repo.listAuditRecords({ toolName: "admin.users.disable" })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "allowed", inputSummary: expect.objectContaining({ _policyMode: "auditOnly" }) }),
        expect.objectContaining({ status: "succeeded", inputSummary: expect.objectContaining({ _policyMode: "auditOnly" }) })
      ])
    );
  });

  it("lists and executes executor plugin tools", async () => {
    let handlerCalls = 0;
    const repo = createSeedRepository();
    const plugin = executorPlugin();
    await repo.upsertPlugin({ ...pluginRecordFromManifest(plugin), config: { baseUrl: "https://workflow.example.test" } });
    for (const tool of pluginToolsFromManifest(plugin)) {
      await repo.upsertPluginTool(tool);
    }
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})), {
      registry: new PluginRegistry([plugin]),
      auditLogger: new AuditLogger({ repository: repo }),
      executorHandlers: {
        "workflow-plugin": {
          uploadVideo: async (input, context) => {
            handlerCalls += 1;
            await context.checkpoint("validated", { title: (input as { title?: unknown }).title, token: "secret-token" });
            return { ok: true, uploadId: "upload-1" };
          }
        }
      }
    });

    expect(gateway.listTools()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "workflow.upload.video" })]));

    const result = JSON.parse((await gateway.callTool("workflow.upload.video", { title: "Demo" }))[0].text) as {
      ok: boolean;
      data: { uploadId: string };
    };

    expect(result).toEqual({ ok: true, operation: "workflow.upload.video", data: { ok: true, uploadId: "upload-1" } });
    expect(handlerCalls).toBe(1);
    await expect(repo.listAuditRecords({ toolName: "workflow.upload.video" })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "allowed" }),
        expect.objectContaining({
          status: "succeeded",
          inputSummary: expect.objectContaining({ _checkpointStep: "validated", title: "Demo", token: "[REDACTED]" })
        }),
        expect.objectContaining({ status: "succeeded" })
      ])
    );
  });

  it("blocks dangerous executor tools before invoking handlers", async () => {
    let handlerCalls = 0;
    const repo = createSeedRepository();
    const plugin = executorPlugin({ effect: "dangerous" });
    await repo.upsertPlugin({ ...pluginRecordFromManifest(plugin), config: { baseUrl: "https://workflow.example.test" } });
    for (const tool of pluginToolsFromManifest(plugin)) {
      await repo.upsertPluginTool(tool);
    }
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})), {
      registry: new PluginRegistry([plugin]),
      auditLogger: new AuditLogger({ repository: repo }),
      pluginPolicies: { "workflow-plugin": { dangerousMode: "block" } },
      executorHandlers: {
        "workflow-plugin": {
          uploadVideo: () => {
            handlerCalls += 1;
            return { ok: true };
          }
        }
      }
    });

    const result = JSON.parse((await gateway.callTool("workflow.upload.video", { title: "Demo" }))[0].text) as {
      ok: boolean;
      error: { code: string };
    };

    expect(result).toMatchObject({ ok: false, error: { code: "CONFIRMATION_REQUIRED" } });
    expect(handlerCalls).toBe(0);
    await expect(repo.listAuditRecords({ toolName: "workflow.upload.video" })).resolves.toEqual([
      expect.objectContaining({ status: "blocked", errorCode: "CONFIRMATION_REQUIRED" })
    ]);
  });

  it("executes dangerous executor tools under auditOnly and records policy evidence", async () => {
    let handlerCalls = 0;
    const repo = createSeedRepository();
    const plugin = executorPlugin({ effect: "dangerous" });
    await repo.upsertPlugin({ ...pluginRecordFromManifest(plugin), config: { baseUrl: "https://workflow.example.test" } });
    for (const tool of pluginToolsFromManifest(plugin)) {
      await repo.upsertPluginTool(tool);
    }
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})), {
      registry: new PluginRegistry([plugin]),
      auditLogger: new AuditLogger({ repository: repo }),
      pluginPolicies: { "workflow-plugin": { dangerousMode: "auditOnly" } },
      executorHandlers: {
        "workflow-plugin": {
          uploadVideo: () => {
            handlerCalls += 1;
            return { ok: true };
          }
        }
      }
    });

    const result = JSON.parse((await gateway.callTool("workflow.upload.video", { title: "Demo" }))[0].text) as {
      ok: boolean;
    };

    expect(result).toMatchObject({ ok: true });
    expect(handlerCalls).toBe(1);
    await expect(repo.listAuditRecords({ toolName: "workflow.upload.video" })).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: "allowed", inputSummary: expect.objectContaining({ _policyMode: "auditOnly" }) }),
        expect.objectContaining({ status: "succeeded", inputSummary: expect.objectContaining({ _policyMode: "auditOnly" }) })
      ])
    );
  });

  it("does not execute tools that exist only in persisted repository state", async () => {
    const baseUrl = await startFixtureServer(async (_request, response) => {
      response.statusCode = 204;
      response.end();
    });
    const repo = createSeedRepository();
    await repo.upsertPlugin({ ...pluginRecordFromManifest(sampleAdminPlugin), config: { baseUrl } });
    for (const tool of pluginToolsFromManifest(sampleAdminPlugin)) {
      await repo.upsertPluginTool(tool);
    }
    await repo.upsertCredential({
      id: "cred_sample_admin_token",
      pluginId: "sample-admin",
      requirementId: "admin-token",
      name: "Sample admin token",
      type: "bearer",
      secretRef: "env:ADMIN_TOKEN"
    });
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})));

    const response = await gateway.handleJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "admin.users.list", arguments: { page: 1 } }
    });

    expect(response).toMatchObject({
      error: {
        data: { code: "MCP_GATEWAY_ERROR" }
      }
    });
    await expect(repo.listAuditRecords({ toolName: "admin.users.list" })).resolves.toEqual([]);
  });

  it("does not execute executor tools that exist only in persisted repository state", async () => {
    const repo = createSeedRepository();
    const plugin = executorPlugin();
    await repo.upsertPlugin({ ...pluginRecordFromManifest(plugin), config: { baseUrl: "https://workflow.example.test" } });
    for (const tool of pluginToolsFromManifest(plugin)) {
      await repo.upsertPluginTool(tool);
    }
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})), {
      auditLogger: new AuditLogger({ repository: repo }),
      executorHandlers: {
        "workflow-plugin": {
          uploadVideo: () => ({ ok: true })
        }
      }
    });

    const response = await gateway.handleJsonRpc({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: "workflow.upload.video", arguments: { title: "Demo" } }
    });

    expect(response).toMatchObject({
      error: {
        data: { code: "MCP_GATEWAY_ERROR" }
      }
    });
    await expect(repo.listAuditRecords({ toolName: "workflow.upload.video" })).resolves.toEqual([]);
  });

  it("returns CREDENTIAL_MISSING and records a failed audit when a credential binding is absent", async () => {
    const baseUrl = await startFixtureServer(async (_request, response) => {
      response.statusCode = 204;
      response.end();
    });
    const repo = createSeedRepository();
    await repo.upsertPlugin({ ...pluginRecordFromManifest(sampleAdminPlugin), config: { baseUrl } });
    for (const tool of pluginToolsFromManifest(sampleAdminPlugin)) {
      await repo.upsertPluginTool(tool);
    }
    await repo.upsertCredential({
      id: "cred_sample_admin_token",
      pluginId: "sample-admin",
      requirementId: "admin-token",
      name: "Sample admin token",
      type: "bearer",
      secretRef: "env:ADMIN_TOKEN"
    });
    const gateway = new WebMcpGateway(repo, new ExtractionService(repo, new FixtureFetcher({})), {
      registry: new PluginRegistry([sampleAdminPlugin]),
      auditLogger: new AuditLogger({ repository: repo })
    });

    const listResult = JSON.parse((await gateway.callTool("admin.users.list", { page: 1 }))[0].text) as {
      ok: boolean;
      error: { code: string };
    };

    expect(listResult).toMatchObject({
      ok: false,
      error: { code: "CREDENTIAL_MISSING" }
    });
    await expect(repo.listAuditRecords({ toolName: "admin.users.list" })).resolves.toEqual([
      expect.objectContaining({
        status: "allowed"
      }),
      expect.objectContaining({
        status: "failed",
        errorCode: "CREDENTIAL_MISSING"
      })
    ]);
  });
});

async function startFixtureServer(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>): Promise<string> {
  server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve) => server?.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind to a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

function executorPlugin(input: { effect?: "write" | "dangerous" } = {}) {
  return definePlugin({
    id: "workflow-plugin",
    name: "Workflow Plugin",
    version: "0.1.0",
    type: "custom",
    description: "Executor workflow plugin.",
    tools: [
      defineExecutorTool({
        name: "workflow.upload.video",
        description: "Upload video.",
        inputSchema: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string" }
          }
        },
        effect: input.effect ?? "write",
        handler: "uploadVideo"
      })
    ],
    handlers: {
      uploadVideo: async () => ({ ok: true })
    }
  });
}
