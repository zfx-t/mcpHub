import { load } from "cheerio";
import { createDiagnostic, toResourceUri } from "@mcphub/core";
import type { ExtractionInput, ExtractionOutput } from "./types.js";
import { stableHash, stableId } from "./hash.js";

export async function validatedRuleExtract(input: ExtractionInput): Promise<ExtractionOutput> {
  const rule = input.rule;
  if (!rule) {
    return {
      document: emptyDocument(input),
      items: [],
      diagnostics: [
        createDiagnostic({
          code: "RULE_MISMATCH",
          sourceId: input.source.id,
          url: input.url,
          extractionMethod: "validated_rule",
          retryable: false,
          message: "Validated extraction requires an active rule."
        })
      ]
    };
  }

  const $ = load(input.html);
  const title = selectText($, rule.fieldMappings.title) || $("title").text().trim();
  const content = selectText($, rule.fieldMappings.content);
  const canonicalUrl = $("link[rel='canonical']").attr("href") || input.url;

  if (!title || !content) {
    return {
      document: emptyDocument(input),
      items: [],
      diagnostics: [
        createDiagnostic({
          code: "RULE_MISMATCH",
          sourceId: input.source.id,
          ruleId: rule.id,
          url: input.url,
          extractionMethod: "validated_rule",
          retryable: false
        })
      ]
    };
  }

  const documentId = stableId("doc", [rule.id, canonicalUrl, content]);
  const itemId = stableId("item", [rule.id, canonicalUrl, title]);
  const confidence = Math.max(0.5, rule.confidence);
  const document = {
    id: documentId,
    sourceId: input.source.id,
    canonicalUrl,
    title,
    contentText: content,
    contentHtml: rule.fieldMappings.content ? $(rule.fieldMappings.content).first().html() || undefined : undefined,
    summary: content.slice(0, 280),
    fetchedAt: input.fetchedAt,
    sourceRefs: [input.url],
    confidence,
    extractionWarnings: confidence < 0.7 ? ["Validated rule has moderate confidence."] : []
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
    diffHash: stableHash([title, content])
  };

  return { document, items: [item], diagnostics: [] };
}

function selectText($: ReturnType<typeof load>, selector?: string): string {
  if (!selector) {
    return "";
  }
  return $(selector).first().text().replace(/\s+/g, " ").trim();
}

function emptyDocument(input: ExtractionInput) {
  return {
    id: stableId("doc", [input.source.id, input.url, "empty"]),
    sourceId: input.source.id,
    canonicalUrl: input.url,
    title: input.source.name,
    contentText: "",
    fetchedAt: input.fetchedAt,
    sourceRefs: [input.url],
    confidence: 0,
    extractionWarnings: ["No document was extracted."]
  };
}
