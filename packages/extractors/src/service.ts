import { createDiagnostic, normalizeUrl } from "@mcphub/core";
import type { McpHubRepository } from "@mcphub/db";
import { genericExtract } from "./generic.js";
import { findCustomRoute } from "./routes.js";
import type { Fetcher, RefreshResult } from "./types.js";
import { validatedRuleExtract } from "./validated.js";

export class ExtractionService {
  constructor(
    private readonly repository: McpHubRepository,
    private readonly fetcher: Fetcher
  ) {}

  async refreshSource(sourceId: string, options: { mode?: "cached" | "force" | "validate_only"; url?: string } = {}): Promise<RefreshResult> {
    const source = await this.repository.getSource(sourceId);
    if (!source) {
      throw new Error(`Unknown source: ${sourceId}`);
    }

    const existingItems = await this.repository.listItems(source.id);
    if (options.mode !== "force" && options.mode !== "validate_only" && existingItems.length > 0 && source.lastSuccessfulRefreshAt) {
      const ageMs = Date.now() - Date.parse(source.lastSuccessfulRefreshAt);
      if (ageMs < source.refreshPolicy.ttlSeconds * 1000) {
        return { source, items: existingItems, diagnostics: [], cacheStatus: "fresh" };
      }
    }

    const rules = await this.repository.listRules(source.id);
    const activeRule = rules.find((rule) => rule.status === "active");
    const targetUrl = options.url ?? activeRule?.sampleUrls[0] ?? source.urlPattern.replace(/^domain:/, "https://");

    try {
      const fetched = await this.fetcher.fetch(normalizeUrl(targetUrl));
      const route = activeRule?.type === "custom_route" ? findCustomRoute(source.routeKey) : undefined;
      const output = route
        ? await route.extract({ source, rule: activeRule, url: fetched.url, html: fetched.html, fetchedAt: fetched.fetchedAt })
        : activeRule?.type === "validated"
          ? await validatedRuleExtract({ source, rule: activeRule, url: fetched.url, html: fetched.html, fetchedAt: fetched.fetchedAt })
          : await genericExtract({ source, rule: activeRule, url: fetched.url, html: fetched.html, fetchedAt: fetched.fetchedAt });

      if (options.mode !== "validate_only") {
        await this.repository.upsertDocument(output.document);
        await this.repository.upsertFeedItems(output.items);
        for (const diagnostic of output.diagnostics) {
          await this.repository.addDiagnostic(diagnostic);
        }
        await this.repository.updateSourceHealth(source.id, {
          healthStatus: output.diagnostics.length ? "degraded" : "healthy",
          lastSuccessfulRefreshAt: fetched.fetchedAt,
          lastError: undefined,
          failureCount: 0,
          backoffUntil: undefined
        });
      }

      return {
        source: (await this.repository.getSource(source.id)) ?? source,
        document: output.document,
        items: output.items,
        diagnostics: output.diagnostics,
        cacheStatus: options.mode === "validate_only" ? "validated" : "refreshed"
      };
    } catch (error) {
      const diagnostic = createDiagnostic({
        code: error instanceof DOMException && error.name === "AbortError" ? "FETCH_TIMEOUT" : "FETCH_BLOCKED",
        sourceId: source.id,
        url: targetUrl,
        extractionMethod: source.routeKey ? "custom_route" : "generic",
        message: error instanceof Error ? error.message : undefined
      });
      await this.repository.addDiagnostic(diagnostic);
      await this.repository.updateSourceHealth(source.id, {
        healthStatus: "failing",
        lastError: diagnostic.message,
        failureCount: source.failureCount + 1,
        backoffUntil: nextBackoff(source.failureCount + 1)
      });
      return { source, items: existingItems, diagnostics: [diagnostic], cacheStatus: "refreshed" };
    }
  }

  async preview(url: string, sourceId?: string): Promise<RefreshResult> {
    const source = sourceId ? await this.repository.getSource(sourceId) : await this.repository.findSourceByUrl(url);
    if (!source) {
      throw new Error(`No source matches ${url}`);
    }
    return this.refreshSource(source.id, { mode: "validate_only", url });
  }
}

function nextBackoff(failureCount: number): string {
  const seconds = Math.min(3600, 60 * 2 ** Math.max(0, failureCount - 1));
  return new Date(Date.now() + seconds * 1000).toISOString();
}
