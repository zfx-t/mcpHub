import { runMcpClientCli } from "./mcp-client/commands.js";

await runMcpClientCli(process.argv.slice(2));
