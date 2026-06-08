import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: [
      { find: "@mcphub/plugins/local-loader", replacement: fileURLToPath(new URL("./packages/plugins/src/local-loader.ts", import.meta.url)) },
      { find: "@mcphub/core", replacement: fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)) },
      { find: "@mcphub/api-connector", replacement: fileURLToPath(new URL("./packages/api-connector/src/index.ts", import.meta.url)) },
      { find: "@mcphub/audit", replacement: fileURLToPath(new URL("./packages/audit/src/index.ts", import.meta.url)) },
      { find: "@mcphub/credentials", replacement: fileURLToPath(new URL("./packages/credentials/src/index.ts", import.meta.url)) },
      { find: "@mcphub/db", replacement: fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)) },
      { find: "@mcphub/extractors", replacement: fileURLToPath(new URL("./packages/extractors/src/index.ts", import.meta.url)) },
      { find: "@mcphub/plugins", replacement: fileURLToPath(new URL("./packages/plugins/src/index.ts", import.meta.url)) },
      { find: "@mcphub/policy", replacement: fileURLToPath(new URL("./packages/policy/src/index.ts", import.meta.url)) },
      { find: "@mcphub/mcp", replacement: fileURLToPath(new URL("./packages/mcp/src/index.ts", import.meta.url)) }
    ]
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
    pool: "threads"
  }
});
