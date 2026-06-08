import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import { createApp } from "../apps/server/src/app.js";
import { loadConfig } from "../apps/server/src/config.js";
import { createPlatformServices } from "../apps/server/src/platform.js";
import { assertEqual, assertIncludes, assertNotIncludes, assertStatus, getJson, mcpText, postJson } from "./smoke-helpers.js";

const articleHtml = `
  <html>
    <head>
      <title>Hello MCP</title>
      <link rel="canonical" href="https://example.com/">
      <meta name="description" content="Smoke test article">
    </head>
    <body>
      <article>
        <h1>Hello MCP</h1>
        <p>${"Smoke test content. ".repeat(40)}</p>
      </article>
    </body>
  </html>
`;

const repo = createSeedRepository();
let disableCalls = 0;
let localDisableCalls = 0;
const uploadCalls: string[] = [];
let blockedUploadCalls = 0;
const adminServer = await startFixtureServer(async (request, response) => {
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
  if (request.url?.startsWith("/api/local-users") && request.method === "GET") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ users: [{ id: "local-user-1", name: "Grace" }], authorization: request.headers.authorization }));
    return;
  }
  if (request.url?.startsWith("/api/local-users/local-user-1/disable")) {
    localDisableCalls += 1;
    response.statusCode = 204;
    response.end();
    return;
  }
  if (request.url === "/upload/session" && request.method === "POST") {
    uploadCalls.push("session");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ uploadId: "upload-1" }));
    return;
  }
  if (request.url === "/upload/upload-1/parts/1" && request.method === "POST") {
    uploadCalls.push("part-1");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true, part: 1 }));
    return;
  }
  if (request.url === "/upload/upload-1/parts/2" && request.method === "POST") {
    uploadCalls.push("part-2");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true, part: 2 }));
    return;
  }
  if (request.url === "/upload/upload-1/submit" && request.method === "POST") {
    uploadCalls.push("submit");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true, status: "submitted" }));
    return;
  }
  if (request.url === "/upload/upload-1/status" && request.method === "GET") {
    uploadCalls.push("status");
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true, uploadId: "upload-1", status: "ready" }));
    return;
  }
  if (request.url === "/blocked-upload" && request.method === "POST") {
    blockedUploadCalls += 1;
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true }));
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});
const pluginDir = await createLocalPluginFixture(adminServer.baseUrl);
const smokeEnv = {
  PUBLIC_BASE_URL: "http://127.0.0.1:0",
  MCP_SERVER_URL: "http://127.0.0.1:0/mcp",
  REQUEST_LOGGING: "false",
  SAMPLE_ADMIN_API_BASE_URL: adminServer.baseUrl,
  SAMPLE_ADMIN_API_TOKEN_ENV: "SAMPLE_ADMIN_API_TOKEN",
  SAMPLE_ADMIN_API_TOKEN: "secret-token",
  MCPHUB_PLUGIN_DIR: pluginDir,
  LOCAL_ADMIN_API_TOKEN: "local-secret-token",
  FAKE_UPLOAD_TOKEN: "fake-upload-secret"
};
const config = loadConfig(smokeEnv);
const extraction = new ExtractionService(
  repo,
  new FixtureFetcher({
    "https://example.com/": articleHtml
  })
);
const app = createApp({
  repository: repo,
  extraction,
  config,
  platform: await createPlatformServices({ repository: repo, config, env: smokeEnv })
});

await app.listen({ host: "127.0.0.1", port: 0 });
const address = app.server.address();
if (!address || typeof address === "string") {
  throw new Error("Unable to determine smoke server address");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const detect = await postJson(`${baseUrl}/api/detect-site`, {
    url: "https://example.com/articles/hello",
    hostname: "example.com",
    title: "Hello MCP",
    canonicalUrl: "https://example.com/articles/hello",
    metaDescription: "Smoke test article",
    language: "en"
  });
  assertStatus(detect.status, 200, "detect status");
  assertEqual(detect.body.status, "available", "detect result");

  const status = await getJson(`${baseUrl}/api/status`);
  assertStatus(status.status, 200, "status API status");
  assertEqual(status.body.service, "mcphub", "status API service");
  assertIncludes(status.body, "mcphub://status", "status API includes status resource");
  assertIncludes(status.body, "local.admin.users.list", "status API includes local tool");
  assertIncludes(status.body, '"standard":{"compatible":4,"warnings":0,"errors":0}', "status API includes standard summary");
  assertNotIncludes(status.body, "local-secret-token", "status API redacts local secret value");

  const plugins = await getJson(`${baseUrl}/api/plugins`);
  assertStatus(plugins.status, 200, "plugins API status");
  assertIncludes(plugins.body, "local-admin", "plugins API includes local-admin");
  assertIncludes(plugins.body, "loaded_plugin", "plugins API includes load diagnostics");
  assertNotIncludes(plugins.body, "local-secret-token", "plugins API redacts local secret value");

  const init = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 0,
    method: "initialize",
    params: {
      protocolVersion: "2025-11-25",
      capabilities: {},
      clientInfo: { name: "smoke", version: "0.1.0" }
    }
  });
  assertStatus(init.status, 200, "initialize status");

  const list = await postJson(`${baseUrl}/mcp`, { jsonrpc: "2.0", id: 1, method: "resources/list", params: {} });
  assertStatus(list.status, 200, "resources/list status");

  const pluginList = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 11,
    method: "resources/read",
    params: { uri: "mcphub://plugins" }
  });
  assertStatus(pluginList.status, 200, "plugin list status");
  const pluginListText = mcpText(pluginList.body);
  assertIncludes(pluginListText, "sample-admin", "plugin list includes sample admin");
  assertIncludes(pluginListText, "local-admin", "plugin list includes local admin");
  assertIncludes(pluginListText, "\"source\": \"local\"", "plugin list includes local metadata");
  assertNotIncludes(pluginListText, "local-secret-token", "plugin list redacts local secret value");

  const statusResource = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 10,
    method: "resources/read",
    params: { uri: "mcphub://status" }
  });
  assertStatus(statusResource.status, 200, "status resource status");
  const statusResourceText = mcpText(statusResource.body);
  assertIncludes(statusResourceText, "mcphub://status", "status resource includes status URI");
  assertIncludes(statusResourceText, "fake.upload.video", "status resource includes executor tool");
  assertIncludes(statusResourceText, '"standard": {\n      "compatible": 4,\n      "warnings": 0,\n      "errors": 0\n    }', "status resource includes standard summary");
  assertNotIncludes(statusResourceText, "fake-upload-secret", "status resource redacts fake upload secret");

  const toolList = await postJson(`${baseUrl}/mcp`, { jsonrpc: "2.0", id: 12, method: "tools/list", params: {} });
  assertStatus(toolList.status, 200, "tools/list status");
  assertIncludes(toolList.body, "admin.users.list", "tools/list includes admin.users.list");
  assertIncludes(toolList.body, "local.admin.users.list", "tools/list includes local.admin.users.list");
  assertIncludes(toolList.body, "fake.upload.video", "tools/list includes fake.upload.video");
  assertIncludes(toolList.body, "blocked.upload.video", "tools/list includes blocked.upload.video");

  const refresh = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "source.refresh", arguments: { sourceId: "src_example_articles", mode: "force" } }
  });
  assertStatus(refresh.status, 200, "source.refresh status");

  const items = await repo.listItems("src_example_articles");
  assertEqual(items.length, 1, "refreshed item count");

  const readItem = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 3,
    method: "resources/read",
    params: { uri: `webmcp://items/${items[0].id}` }
  });
  assertStatus(readItem.status, 200, "item read status");
  if (!mcpText(readItem.body).includes("Hello MCP")) {
    throw new Error("item read did not include expected content");
  }

  const debug = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "debug.explain", arguments: { itemId: items[0].id } }
  });
  assertStatus(debug.status, 200, "debug.explain status");

  const adminUsers = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: { name: "admin.users.list", arguments: { page: 1 } }
  });
  assertStatus(adminUsers.status, 200, "admin.users.list status");
  const adminUsersText = mcpText(adminUsers.body);
  assertIncludes(adminUsersText, "Ada", "admin.users.list result");
  assertIncludes(adminUsersText, "Bearer secret-token", "admin.users.list auth forwarding");

  const localUsers = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 16,
    method: "tools/call",
    params: { name: "local.admin.users.list", arguments: { page: 1 } }
  });
  assertStatus(localUsers.status, 200, "local.admin.users.list status");
  const localUsersText = mcpText(localUsers.body);
  assertIncludes(localUsersText, "Grace", "local.admin.users.list result");
  assertIncludes(localUsersText, "Bearer local-secret-token", "local.admin.users.list auth forwarding");

  const disable = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 14,
    method: "tools/call",
    params: { name: "admin.users.disable", arguments: { id: "user-1" } }
  });
  assertStatus(disable.status, 200, "admin.users.disable status");
  assertIncludes(mcpText(disable.body), "CONFIRMATION_REQUIRED", "admin.users.disable confirmation block");
  assertEqual(disableCalls, 0, "dangerous remote call count");

  const localDisable = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 17,
    method: "tools/call",
    params: { name: "local.admin.users.disable", arguments: { id: "local-user-1" } }
  });
  assertStatus(localDisable.status, 200, "local.admin.users.disable status");
  assertIncludes(mcpText(localDisable.body), "\"ok\": true", "local.admin.users.disable auditOnly success");
  assertEqual(localDisableCalls, 1, "local dangerous remote call count");

  const dryRunUpload = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 18,
    method: "tools/call",
    params: { name: "fake.upload.video", arguments: { title: "Demo Upload", dryRun: true } }
  });
  assertStatus(dryRunUpload.status, 200, "fake.upload.video dryRun status");
  assertIncludes(mcpText(dryRunUpload.body), "\"dryRun\": true", "fake.upload.video dryRun result");
  assertEqual(uploadCalls.length, 0, "fake.upload.video dryRun remote call count");

  const upload = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 19,
    method: "tools/call",
    params: { name: "fake.upload.video", arguments: { title: "Demo Upload" } }
  });
  assertStatus(upload.status, 200, "fake.upload.video status");
  assertIncludes(mcpText(upload.body), "\"uploadId\": \"upload-1\"", "fake.upload.video upload id");
  assertIncludes(mcpText(upload.body), "\"status\": \"ready\"", "fake.upload.video status result");
  assertEqual(uploadCalls.join(","), "session,part-1,part-2,submit,status", "fake.upload.video remote call sequence");

  const blockedUpload = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: { name: "blocked.upload.video", arguments: { title: "Blocked Upload" } }
  });
  assertStatus(blockedUpload.status, 200, "blocked.upload.video status");
  assertIncludes(mcpText(blockedUpload.body), "CONFIRMATION_REQUIRED", "blocked.upload.video confirmation block");
  assertEqual(blockedUploadCalls, 0, "blocked.upload.video handler call count");

  const audit = await postJson(`${baseUrl}/mcp`, {
    jsonrpc: "2.0",
    id: 15,
    method: "resources/read",
    params: { uri: "mcphub://audit/recent" }
  });
  assertStatus(audit.status, 200, "audit recent status");
  const auditText = mcpText(audit.body);
  assertIncludes(auditText, "CONFIRMATION_REQUIRED", "audit recent contains blocked call");
  assertIncludes(auditText, "user-1", "audit recent contains blocked call input");
  assertIncludes(auditText, "local.admin.users.disable", "audit recent contains local dangerous call");
  assertIncludes(auditText, "fake.upload.video", "audit recent contains executor upload call");
  assertIncludes(auditText, "_checkpointStep", "audit recent contains executor checkpoints");
  assertIncludes(auditText, "upload-session-created", "audit recent contains upload session checkpoint");
  assertIncludes(auditText, "blocked.upload.video", "audit recent contains blocked executor call");
  assertIncludes(auditText, "_policyMode", "audit recent contains policy evidence");
  assertIncludes(auditText, "auditOnly", "audit recent contains auditOnly evidence");

  console.log("Smoke test passed");
} finally {
  await app.close();
  await adminServer.close();
  await rm(pluginDir, { recursive: true, force: true });
}

async function startFixtureServer(handler: (request: IncomingMessage, response: ServerResponse) => void | Promise<void>): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server: Server = createServer((request, response) => {
    void handler(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Fixture server did not bind to a TCP port.");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  };
}

async function createLocalPluginFixture(baseUrl: string): Promise<string> {
  const pluginDir = await mkdtemp(path.join(os.tmpdir(), "mcphub-smoke-plugins-"));
  const localAdminPath = path.join(pluginDir, "local-admin");
  await mkdir(localAdminPath, { recursive: true });
  await writeFile(path.join(localAdminPath, "index.js"), localPluginModuleSource());
  await writeFile(
    path.join(localAdminPath, "plugin.config.json"),
    JSON.stringify(
      {
        enabled: true,
        config: { baseUrl },
        credentials: {
          "admin-token": {
            type: "bearer",
            secretRef: "env:LOCAL_ADMIN_API_TOKEN"
          }
        },
        policy: {
          dangerousMode: "auditOnly"
        }
      },
      null,
      2
    )
  );

  const fakeUploadPath = path.join(pluginDir, "fake-upload");
  await mkdir(fakeUploadPath, { recursive: true });
  await writeFile(path.join(fakeUploadPath, "index.js"), fakeUploadPluginModuleSource());
  await writeFile(
    path.join(fakeUploadPath, "plugin.config.json"),
    JSON.stringify(
      {
        enabled: true,
        config: { baseUrl },
        credentials: {
          "upload-token": {
            type: "bearer",
            secretRef: "env:FAKE_UPLOAD_TOKEN"
          }
        },
        policy: {
          dangerousMode: "auditOnly"
        }
      },
      null,
      2
    )
  );

  const blockedUploadPath = path.join(pluginDir, "blocked-upload");
  await mkdir(blockedUploadPath, { recursive: true });
  await writeFile(path.join(blockedUploadPath, "index.js"), blockedUploadPluginModuleSource());
  await writeFile(
    path.join(blockedUploadPath, "plugin.config.json"),
    JSON.stringify(
      {
        enabled: true,
        config: { baseUrl },
        credentials: {},
        policy: {
          dangerousMode: "block"
        }
      },
      null,
      2
    )
  );
  return pluginDir;
}

function localPluginModuleSource(): string {
  return `export default {
  id: "local-admin",
  name: "Local Admin",
  version: "0.1.0",
  type: "api",
  description: "Local admin smoke plugin.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["http", "credentials", "policy", "audit", "plugin-config"]
  },
  credentials: [{ id: "admin-token", type: "bearer" }],
  tools: [
    {
      name: "local.admin.users.list",
      description: "List local users.",
      inputSchema: { type: "object", properties: { page: { type: "number" } } },
      effect: "read",
      credentialRefs: ["admin-token"],
      operation: { type: "http", method: "GET", path: "/api/local-users" }
    },
    {
      name: "local.admin.users.disable",
      description: "Disable a local user.",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
      effect: "dangerous",
      credentialRefs: ["admin-token"],
      operation: { type: "http", method: "POST", path: "/api/local-users/{id}/disable" }
    }
  ]
};
`;
}

function fakeUploadPluginModuleSource(): string {
  return `export default {
  id: "fake-upload",
  name: "Fake Upload",
  version: "0.1.0",
  type: "custom",
  description: "Fake multi-step executor upload smoke plugin.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["executor", "credentials", "policy", "audit", "checkpoint", "plugin-config"]
  },
  credentials: [{ id: "upload-token", type: "bearer" }],
  tools: [
    {
      name: "fake.upload.video",
      description: "Run a fake multi-step upload workflow.",
      inputSchema: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string" },
          dryRun: { type: "boolean" }
        }
      },
      effect: "dangerous",
      credentialRefs: ["upload-token"],
      executor: { type: "module", handler: "uploadVideo" }
    }
  ],
  handlers: {
    async uploadVideo(input, context) {
      await context.checkpoint("validated", { title: input.title, dryRun: Boolean(input.dryRun) });
      if (input.dryRun) {
        return {
          ok: true,
          dryRun: true,
          plan: ["create-session", "upload-part-1", "upload-part-2", "submit", "poll-status"]
        };
      }

      const session = await context.http.post("/upload/session", { title: input.title });
      await context.checkpoint("upload-session-created", { uploadId: session.uploadId });
      await context.http.post("/upload/" + session.uploadId + "/parts/1", { text: "part-one" });
      await context.checkpoint("upload-part", { uploadId: session.uploadId, part: 1 });
      await context.http.post("/upload/" + session.uploadId + "/parts/2", { text: "part-two" });
      await context.checkpoint("upload-part", { uploadId: session.uploadId, part: 2 });
      await context.http.post("/upload/" + session.uploadId + "/submit", {});
      await context.checkpoint("submitted", { uploadId: session.uploadId });
      const status = await context.http.get("/upload/" + session.uploadId + "/status");
      await context.checkpoint("status-polled", { uploadId: status.uploadId, status: status.status });
      return { ok: true, uploadId: status.uploadId, status: status.status };
    }
  }
};
`;
}

function blockedUploadPluginModuleSource(): string {
  return `export default {
  id: "blocked-upload",
  name: "Blocked Upload",
  version: "0.1.0",
  type: "custom",
  description: "Executor plugin used to prove dangerous block prevents handler invocation.",
  mcphub: {
    minVersion: "0.1.0",
    capabilities: ["executor", "policy", "audit", "checkpoint", "plugin-config"]
  },
  tools: [
    {
      name: "blocked.upload.video",
      description: "Blocked fake upload workflow.",
      inputSchema: {
        type: "object",
        required: ["title"],
        properties: {
          title: { type: "string" }
        }
      },
      effect: "dangerous",
      executor: { type: "module", handler: "uploadVideo" }
    }
  ],
  handlers: {
    async uploadVideo(_input, context) {
      await context.http.post("/blocked-upload", {});
      return { ok: true };
    }
  }
};
`;
}
