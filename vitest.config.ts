import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@mcphub/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@mcphub/api-connector": fileURLToPath(new URL("./packages/api-connector/src/index.ts", import.meta.url)),
      "@mcphub/audit": fileURLToPath(new URL("./packages/audit/src/index.ts", import.meta.url)),
      "@mcphub/credentials": fileURLToPath(new URL("./packages/credentials/src/index.ts", import.meta.url)),
      "@mcphub/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
      "@mcphub/extractors": fileURLToPath(new URL("./packages/extractors/src/index.ts", import.meta.url)),
      "@mcphub/plugins": fileURLToPath(new URL("./packages/plugins/src/index.ts", import.meta.url)),
      "@mcphub/policy": fileURLToPath(new URL("./packages/policy/src/index.ts", import.meta.url)),
      "@mcphub/mcp": fileURLToPath(new URL("./packages/mcp/src/index.ts", import.meta.url))
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
    pool: "threads"
  }
});
