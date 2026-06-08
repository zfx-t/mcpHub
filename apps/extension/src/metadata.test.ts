import { describe, expect, it } from "vitest";
import { buildDetectionPayload } from "./metadata.js";

describe("extension metadata helpers", () => {
  it("builds detection payload from tab URL and page metadata", () => {
    expect(
      buildDetectionPayload("https://example.com/a", {
        title: "Example",
        canonicalUrl: "https://example.com/a",
        metaDescription: "Desc",
        language: "en"
      })
    ).toEqual({
      url: "https://example.com/a",
      hostname: "example.com",
      title: "Example",
      canonicalUrl: "https://example.com/a",
      metaDescription: "Desc",
      language: "en"
    });
  });
});
