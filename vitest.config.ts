import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@mcphub/core": fileURLToPath(new URL("./packages/core/src/index.ts", import.meta.url)),
      "@mcphub/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
      "@mcphub/extractors": fileURLToPath(new URL("./packages/extractors/src/index.ts", import.meta.url)),
      "@mcphub/mcp": fileURLToPath(new URL("./packages/mcp/src/index.ts", import.meta.url))
    }
  },
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.ts", "scripts/**/*.test.ts"],
    pool: "threads"
  }
});
