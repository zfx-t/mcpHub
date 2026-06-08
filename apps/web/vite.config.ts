import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  server: {
    allowedHosts: ["code.mifen.tech"]
  },
  build: {
    outDir: "dist",
    emptyOutDir: true
  }
});
