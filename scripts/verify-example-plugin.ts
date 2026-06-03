import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import os from "node:os";
import path from "node:path";
import { createSeedRepository } from "@mcphub/db";
import { ExtractionService, FixtureFetcher } from "@mcphub/extractors";
import { createApp } from "../apps/server/src/app.js";
import { loadConfig } from "../apps/server/src/config.js";
import { createPlatformServices } from "../apps/server/src/platform.js";

const uploadCalls: string[] = [];
const fixture = await startFixtureServer(async (request, response) => {
  if (request.url === "/upload/session" && request.method === "POST") {
    uploadCalls.push("session");
    json(response, { uploadId: "upload-1" });
    return;
  }
  if (request.url === "/upload/upload-1/parts/1" && request.method === "POST") {
    uploadCalls.push("part-1");
    json(response, { ok: true, part: 1 });
    return;
  }
  if (request.url === "/upload/upload-1/parts/2" && request.method === "POST") {
    uploadCalls.push("part-2");
    json(response, { ok: true, part: 2 });
    return;
  }
  if (request.url === "/upload/upload-1/submit" && request.method === "POST") {
    uploadCalls.push("submit");
    json(response, { ok: true, status: "submitted" });
    return;
  }
  if (request.url === "/upload/upload-1/status" && request.method === "GET") {
    uploadCalls.push("status");
    json(response, { ok: true, uploadId: "upload-1", status: "ready" });
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});
const pluginDir = await createRuntimePluginDir(fixture.baseUrl);

const repo = createSeedRepository();
const env = {
  PUBLIC_BASE_URL: "http://127.0.0.1:0",
  MCP_SERVER_URL: "http://127.0.0.1:0/mcp",
  REQUEST_LOGGING: "false",
  MCPHUB_PLUGIN_DIR: pluginDir,
  FAKE_UPLOAD_TOKEN: "fake-upload-secret"
};
const config = loadConfig(env);
const app = createApp({
  repository: repo,
  extraction: new ExtractionService(repo, new FixtureFetcher({})),
  config,
  platform: await createPlatformServices({ repository: repo, config, env })
});

await app.listen({ host: "127.0.0.1", port: 0 });
const address = app.server.address();
if (!address || typeof address === "string") {
  throw new Error("Unable to determine server address");
}
const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const tools = await mcp(baseUrl, "tools/list", {});
  assertIncludes(tools, "fake.upload.video", "tools/list should include fake.upload.video");

  const dryRun = await mcp(baseUrl, "tools/call", {
    name: "fake.upload.video",
    arguments: { title: "Example Upload", dryRun: true }
  });
  assertIncludes(dryRun, "\"dryRun\": true", "dryRun result");
  assertEqual(uploadCalls.length, 0, "dryRun remote calls");

  const upload = await mcp(baseUrl, "tools/call", {
    name: "fake.upload.video",
    arguments: { title: "Example Upload" }
  });
  assertIncludes(upload, "\"uploadId\": \"upload-1\"", "upload result id");
  assertIncludes(upload, "\"status\": \"ready\"", "upload result status");
  assertEqual(uploadCalls.join(","), "session,part-1,part-2,submit,status", "upload remote call sequence");

  const audit = await mcp(baseUrl, "resources/read", { uri: "mcphub://audit/recent" });
  assertIncludes(audit, "fake.upload.video", "audit includes tool");
  assertIncludes(audit, "_checkpointStep", "audit includes checkpoint evidence");
  assertIncludes(audit, "upload-session-created", "audit includes upload checkpoint");

  console.log("Example executor plugin verification passed");
  console.log(`Plugin source directory: ${path.resolve("examples/plugins/fake-upload")}`);
} finally {
  await app.close();
  await fixture.close();
  await rm(pluginDir, { recursive: true, force: true });
}

async function mcp(baseUrl: string, method: string, params: Record<string, unknown>): Promise<string> {
  const response = await fetch(`${baseUrl}/mcp`, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params })
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} returned HTTP ${response.status}: ${text}`);
  }
  return mcpText(parseMcpResponse(text));
}

function parseMcpResponse(text: string): unknown {
  if (!text.startsWith("event:")) {
    return JSON.parse(text);
  }
  const dataLine = text
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.startsWith("data: "));
  if (!dataLine) {
    throw new Error(`MCP SSE response did not include data line: ${text}`);
  }
  return JSON.parse(dataLine.slice("data: ".length));
}

function mcpText(body: unknown): string {
  if (!body || typeof body !== "object") {
    return stringify(body);
  }
  const record = body as {
    result?: {
      content?: Array<{ text?: string }>;
      contents?: Array<{ text?: string }>;
    };
  };
  const content = record.result?.content?.map((entry) => entry.text ?? "").join("\n");
  if (content) {
    return content;
  }
  const contents = record.result?.contents?.map((entry) => entry.text ?? "").join("\n");
  return contents || stringify(body);
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

async function createRuntimePluginDir(baseUrl: string): Promise<string> {
  const pluginRoot = await mkdtemp(path.join(os.tmpdir(), "mcphub-example-plugins-"));
  const pluginPath = path.join(pluginRoot, "fake-upload");
  await mkdir(pluginPath, { recursive: true });
  await copyFile(path.resolve("examples/plugins/fake-upload/index.js"), path.join(pluginPath, "index.js"));
  await writeFile(
    path.join(pluginPath, "plugin.config.json"),
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
  return pluginRoot;
}

function json(response: ServerResponse, value: unknown): void {
  response.setHeader("Content-Type", "application/json");
  response.end(JSON.stringify(value));
}

function assertIncludes(value: unknown, expected: string, label: string): void {
  const actual = stringify(value);
  if (!actual.includes(expected)) {
    throw new Error(`${label}: expected ${expected}. Actual: ${actual.slice(0, 1000)}`);
  }
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
