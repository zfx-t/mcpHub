import { load } from "cheerio";
import { toResourceUri } from "@mcphub/core";
import type { CustomRoute, ExtractionInput, ExtractionOutput } from "./types.js";
import { stableHash, stableId } from "./hash.js";

function articleRoute(routeKey: string, selector: string): CustomRoute {
  return {
    routeKey,
    async extract(input: ExtractionInput): Promise<ExtractionOutput> {
      const $ = load(input.html);
      const title = $("h1").first().text().trim() || $("title").text().trim() || input.source.name;
      const body = $(selector).first().text().replace(/\s+/g, " ").trim();
      const canonicalUrl = $("link[rel='canonical']").attr("href") || input.url;
      const documentId = stableId("doc", [routeKey, canonicalUrl, body]);
      const itemId = stableId("item", [routeKey, canonicalUrl, title]);
      const confidence = body.length > 80 ? 0.95 : 0.55;
      const document = {
        id: documentId,
        sourceId: input.source.id,
        canonicalUrl,
        title,
        contentText: body,
        contentHtml: $(selector).first().html() || undefined,
        summary: body.slice(0, 280),
        fetchedAt: input.fetchedAt,
        sourceRefs: [input.url],
        confidence,
        extractionWarnings: confidence < 0.8 ? ["Custom route extracted short content."] : []
      };
      const item = {
        id: itemId,
        sourceId: input.source.id,
        documentId,
        title,
        url: canonicalUrl,
        snippet: document.summary ?? "",
        contentRef: toResourceUri("items", itemId),
        tags: [],
        entities: [],
        readabilityScore: confidence,
        diffHash: stableHash([title, body])
      };
      return { document, items: [item], diagnostics: [] };
    }
  };
}

export const customRoutes: CustomRoute[] = [
  articleRoute("example_articles", "article"),
  articleRoute("newsroom", "main"),
  articleRoute("blog_posts", "article")
];

export function findCustomRoute(routeKey?: string): CustomRoute | undefined {
  return customRoutes.find((route) => route.routeKey === routeKey);
}
