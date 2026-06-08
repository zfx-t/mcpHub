import { createServer } from "node:http";

const port = Number(process.env.ADMIN_FIXTURE_PORT ?? 4001);
let disableCalls = 0;

const server = createServer((request, response) => {
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
  if (request.url === "/healthz") {
    response.setHeader("Content-Type", "application/json");
    response.end(JSON.stringify({ ok: true, disableCalls }));
    return;
  }
  response.statusCode = 404;
  response.end("not found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Admin fixture listening on http://0.0.0.0:${port}`);
});
