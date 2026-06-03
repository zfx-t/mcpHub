import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogger } from "@mcphub/audit";
import { EnvironmentCredentialStore } from "@mcphub/credentials";
import type { Plugin, PluginTool } from "@mcphub/core";
import { createSeedRepository } from "@mcphub/db";
import { PluginExecutorRuntime } from "./executor-runtime.js";

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
    server = undefined;
  }
});

describe("PluginExecutorRuntime", () => {
  it("invokes a loaded handler with context", async () => {
    const repo = createSeedRepository();
    const plugin = pluginRecord();
    const tool = executorTool();
    await repo.upsertPlugin(plugin);
    await repo.upsertPluginTool(tool);
    const runtime = new PluginExecutorRuntime({
      repository: repo,
      handlers: {
        "workflow-plugin": {
          uploadVideo: async (input, context) => ({
            input,
            pluginId: context.pluginId,
            toolName: context.toolName,
            requestId: context.requestId
          })
        }
      }
    });

    await expect(runtime.execute({ requestId: "req-1", plugin, tool, input: { title: "Demo" } })).resolves.toEqual({
      input: { title: "Demo" },
      pluginId: "workflow-plugin",
      toolName: "workflow.upload.video",
      requestId: "req-1"
    });
  });

  it("fails when a handler is missing", async () => {
    const repo = createSeedRepository();
    const plugin = pluginRecord();
    const tool = executorTool();
    await repo.upsertPlugin(plugin);
    await repo.upsertPluginTool(tool);
    const runtime = new PluginExecutorRuntime({ repository: repo, handlers: {} });

    await expect(runtime.execute({ requestId: "req-1", plugin, tool, input: {} })).rejects.toMatchObject({
      code: "PLUGIN_EXECUTION_ERROR"
    });
  });

  it("normalizes thrown plugin errors", async () => {
    const repo = createSeedRepository();
    const plugin = pluginRecord();
    const tool = executorTool();
    await repo.upsertPlugin(plugin);
    await repo.upsertPluginTool(tool);
    const runtime = new PluginExecutorRuntime({
      repository: repo,
      handlers: {
        "workflow-plugin": {
          uploadVideo: () => {
            throw new Error("remote workflow rejected");
          }
        }
      }
    });

    await expect(runtime.execute({ requestId: "req-1", plugin, tool, input: {} })).rejects.toMatchObject({
      code: "PLUGIN_EXECUTION_ERROR",
      message: "remote workflow rejected"
    });
  });

  it("resolves requested credentials through the credential store", async () => {
    const repo = createSeedRepository();
    const plugin = pluginRecord();
    const tool = executorTool({ credentialRefs: ["session-cookie"] });
    await repo.upsertPlugin(plugin);
    await repo.upsertPluginTool(tool);
    await repo.upsertCredential({
      id: "workflow-plugin.session-cookie",
      pluginId: "workflow-plugin",
      requirementId: "session-cookie",
      name: "session-cookie",
      type: "cookie",
      secretRef: "env:SESSION_COOKIE"
    });
    const runtime = new PluginExecutorRuntime({
      repository: repo,
      credentialStore: new EnvironmentCredentialStore({ env: { SESSION_COOKIE: "SESSDATA=secret" } }),
      handlers: {
        "workflow-plugin": {
          uploadVideo: async (_input, context) => context.credentials.resolve("session-cookie")
        }
      }
    });

    await expect(runtime.execute({ requestId: "req-1", plugin, tool, input: {} })).resolves.toMatchObject({
      type: "cookie",
      value: "SESSDATA=secret"
    });
  });

  it("reports missing credential bindings", async () => {
    const repo = createSeedRepository();
    const plugin = pluginRecord();
    const tool = executorTool({ credentialRefs: ["session-cookie"] });
    await repo.upsertPlugin(plugin);
    await repo.upsertPluginTool(tool);
    const runtime = new PluginExecutorRuntime({
      repository: repo,
      handlers: {
        "workflow-plugin": {
          uploadVideo: async (_input, context) => context.credentials.resolve("session-cookie")
        }
      }
    });

    await expect(runtime.execute({ requestId: "req-1", plugin, tool, input: {} })).rejects.toMatchObject({
      code: "CREDENTIAL_MISSING"
    });
  });

  it("reports missing baseUrl for context HTTP calls", async () => {
    const repo = createSeedRepository();
    const plugin = pluginRecord({ config: {} });
    const tool = executorTool();
    await repo.upsertPlugin(plugin);
    await repo.upsertPluginTool(tool);
    const runtime = new PluginExecutorRuntime({
      repository: repo,
      handlers: {
        "workflow-plugin": {
          uploadVideo: async (_input, context) => context.http.post("/upload/session", { title: "Demo" })
        }
      }
    });

    await expect(runtime.execute({ requestId: "req-1", plugin, tool, input: {} })).rejects.toMatchObject({
      code: "PLUGIN_EXECUTION_ERROR",
      message: "Plugin workflow-plugin is missing config.baseUrl."
    });
  });

  it("performs context HTTP calls through ApiConnector", async () => {
    const calls: Array<{ method?: string; url?: string; body: unknown }> = [];
    const baseUrl = await startFixtureServer(async (request, response) => {
      calls.push({ method: request.method, url: request.url, body: await readJsonBody(request) });
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ uploadId: "up-1" }));
    });
    const repo = createSeedRepository();
    const plugin = pluginRecord({ config: { baseUrl } });
    const tool = executorTool();
    await repo.upsertPlugin(plugin);
    await repo.upsertPluginTool(tool);
    const runtime = new PluginExecutorRuntime({
      repository: repo,
      handlers: {
        "workflow-plugin": {
          uploadVideo: async (_input, context) => context.http.post("/upload/session", { title: "Demo" })
        }
      }
    });

    await expect(runtime.execute({ requestId: "req-1", plugin, tool, input: {} })).resolves.toEqual({ uploadId: "up-1" });
    expect(calls).toEqual([{ method: "POST", url: "/upload/session", body: { title: "Demo" } }]);
  });

  it("records redacted checkpoint audit evidence", async () => {
    const repo = createSeedRepository();
    const plugin = pluginRecord();
    const tool = executorTool();
    await repo.upsertPlugin(plugin);
    await repo.upsertPluginTool(tool);
    const runtime = new PluginExecutorRuntime({
      repository: repo,
      auditLogger: new AuditLogger({ repository: repo }),
      handlers: {
        "workflow-plugin": {
          uploadVideo: async (_input, context) => {
            await context.checkpoint("validated", { title: "Demo", token: "secret-token" });
            return { ok: true };
          }
        }
      }
    });

    await runtime.execute({ requestId: "req-1", plugin, tool, input: {} });

    await expect(repo.listAuditRecords({ toolName: "workflow.upload.video" })).resolves.toEqual([
      expect.objectContaining({
        requestId: "req-1",
        status: "succeeded",
        inputSummary: { _checkpointStep: "validated", title: "Demo", token: "[REDACTED]" }
      })
    ]);
  });
});

function pluginRecord(patch: Partial<Plugin> = {}): Plugin {
  return {
    id: "workflow-plugin",
    name: "Workflow Plugin",
    version: "0.1.0",
    type: "custom",
    description: "Workflow plugin.",
    enabled: true,
    config: { baseUrl: "https://workflow.example.test" },
    ...patch
  };
}

function executorTool(patch: Partial<PluginTool> = {}): PluginTool {
  return {
    id: "workflow-plugin.workflow.upload.video",
    pluginId: "workflow-plugin",
    name: "workflow.upload.video",
    description: "Upload video.",
    inputSchema: { type: "object" },
    effect: "write",
    requiresConfirmation: false,
    credentialRefs: [],
    executor: { type: "module", handler: "uploadVideo" },
    enabled: true,
    ...patch
  };
}

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

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : undefined;
}
