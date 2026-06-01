import { describe, expect, it } from "vitest";
import { createSeedRepository } from "./index.js";

describe("MemoryRepository", () => {
  it("loads seed sources and matches by URL", async () => {
    const repo = createSeedRepository();
    await expect(repo.listSources()).resolves.toHaveLength(4);
    await expect(repo.findSourceByUrl("https://example.com/articles/hello")).resolves.toMatchObject({
      id: "src_example_articles"
    });
  });

  it("filters sources by hostname", async () => {
    const repo = createSeedRepository();
    await expect(repo.listSources({ hostname: "news.example.net" })).resolves.toHaveLength(1);
  });
});
