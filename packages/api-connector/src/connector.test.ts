import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ApiConnector, buildUrl, injectCredentials, summarizeRequest } from "./connector.js";
import { redactSecrets, redactUrl } from "./redaction.js";

let server: Server | undefined;

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => server?.close((error) => (error ? reject(error) : resolve())));
    server = undefined;
  }
});

describe("ApiConnector", () => {
  it("executes JSON requests with path, query, body, and auth", async () => {
    const baseUrl = await startFixtureServer(async (request, response) => {
      const chunks: Buffer[] = [];
      for await (const chunk of request) {
        chunks.push(Buffer.from(chunk));
      }
      response.setHeader("Content-Type", "application/json");
      response.end(
        JSON.stringify({
          url: request.url,
          method: request.method,
          authorization: request.headers.authorization,
          body: JSON.parse(Buffer.concat(chunks).toString("utf8"))
        })
      );
    });
    const connector = new ApiConnector();

    const result = await connector.executeJson({
      baseUrl,
      method: "POST",
      path: "/users/{id}",
      pathParams: { id: "user 1" },
      query: { include: ["roles", "teams"] },
      body: { active: false },
      credentials: [{ id: "token", pluginId: "admin", type: "bearer", value: "top-secret" }]
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toMatchObject({
        method: "POST",
        authorization: "Bearer top-secret",
        body: { active: false }
      });
      expect((result.data as { url: string }).url).toContain("/users/user%201?include=roles&include=teams");
      expect(result.metadata.targetUrl).not.toContain("top-secret");
    }
  });

  it("returns structured remote HTTP errors", async () => {
    const baseUrl = await startFixtureServer(async (_request, response) => {
      response.statusCode = 403;
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ error: "forbidden" }));
    });

    const result = await new ApiConnector().executeJson({ baseUrl, method: "GET", path: "/users" });

    expect(result).toMatchObject({
      ok: false,
      error: { code: "REMOTE_HTTP_ERROR", retryable: false },
      metadata: { statusCode: 403 }
    });
  });

  it("times out slow remotes", async () => {
    const baseUrl = await startFixtureServer(async (_request, response) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      response.end("{}");
    });

    const result = await new ApiConnector().executeJson({ baseUrl, method: "GET", path: "/slow", timeoutMs: 1 });

    expect(result).toMatchObject({ ok: false, error: { code: "REMOTE_TIMEOUT", retryable: true } });
  });

  it("injects all supported credential modes", () => {
    const url = new URL("https://admin.local/users");
    const headers = new Headers();

    expect(
      injectCredentials(url, headers, [
        { id: "bearer", pluginId: "admin", type: "bearer", value: "token" },
        { id: "header", pluginId: "admin", type: "api_key_header", value: "header-key", scope: "X-Admin-Key" },
        { id: "query", pluginId: "admin", type: "api_key_query", value: "query-key", scope: "admin_key" },
        { id: "basic", pluginId: "admin", type: "basic", value: JSON.stringify({ username: "u", password: "p" }) },
        { id: "cookie", pluginId: "admin", type: "cookie", value: "sid=cookie-secret" },
        { id: "env", pluginId: "admin", type: "env", value: "env-secret", scope: "query:env_key" }
      ])
    ).toBeUndefined();

    expect(headers.get("Authorization")).toMatch(/^Basic /);
    expect(headers.get("X-Admin-Key")).toBe("header-key");
    expect(headers.get("Cookie")).toBe("sid=cookie-secret");
    expect(url.searchParams.get("admin_key")).toBe("query-key");
    expect(url.searchParams.get("env_key")).toBe("env-secret");
  });

  it("redacts summaries and target URLs", () => {
    expect(buildUrl({ baseUrl: "https://admin.local", path: "/users/{id}", pathParams: { id: 1 } }).toString()).toBe(
      "https://admin.local/users/1"
    );
    expect(redactUrl("https://admin.local/users?token=abc&query=x")).toBe("https://admin.local/users?token=[REDACTED]&query=x");
    expect(redactSecrets({ password: "p", nested: [{ authorization: "Bearer token-value" }] })).toEqual({
      password: "[REDACTED]",
      nested: [{ authorization: "[REDACTED]" }]
    });
    expect(
      summarizeRequest({
        baseUrl: "https://admin.local",
        method: "POST",
        path: "/users",
        headers: { Authorization: "Bearer token-value" },
        body: { apiKey: "abc" }
      })
    ).toMatchObject({
      headers: { Authorization: "[REDACTED]" },
      body: { apiKey: "[REDACTED]" }
    });
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
