import { load } from "cheerio";
import { createDiagnostic, toResourceUri } from "@mcphub/core";
import type { ExtractionInput, ExtractionOutput } from "./types.js";
import { stableHash, stableId } from "./hash.js";

export async function genericExtract(input: ExtractionInput): Promise<ExtractionOutput> {
  const $ = load(input.html);
  const title = $("meta[property='og:title']").attr("content") || $("h1").first().text() || $("title").text();
  const article = $("article").first().text() || $("main").first().text() || $("body").text();
  const contentText = normalizeText(article);
  const canonicalUrl = $("link[rel='canonical']").attr("href") || input.url;
  const confidence = contentText.length > 300 && title ? 0.68 : 0.35;
  const documentId = stableId("doc", [input.source.id, canonicalUrl, contentText]);
  const itemId = stableId("item", [input.source.id, canonicalUrl, title]);
  const warnings = confidence < 0.5 ? ["Generic extraction produced low-confidence content."] : [];
  const document = {
    id: documentId,
    sourceId: input.source.id,
    canonicalUrl,
    title: title.trim() || input.source.name,
    contentText,
    contentHtml: $("article").first().html() || $("main").first().html() || undefined,
    summary: contentText.slice(0, 280),
    fetchedAt: input.fetchedAt,
    sourceRefs: [input.url],
    confidence,
    extractionWarnings: warnings
  };
  const item = {
    id: itemId,
    sourceId: input.source.id,
    documentId,
    title: document.title,
    url: canonicalUrl,
    snippet: document.summary ?? "",
    contentRef: toResourceUri("items", itemId),
    tags: [],
    entities: [],
    readabilityScore: confidence,
    diffHash: stableHash([document.title, document.contentText])
  };
  const diagnostics =
    confidence < 0.5
      ? [
          createDiagnostic({
            code: "EXTRACTION_LOW_CONFIDENCE",
            sourceId: input.source.id,
            url: input.url,
            extractionMethod: "generic",
            retryable: false
          })
        ]
      : [];

  return { document, items: [item], diagnostics };
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}
