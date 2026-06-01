import type { DetectSiteRequest, DetectSiteResponse, Source } from "./types.js";
import { canonicalTarget, hostnameFromUrl, normalizeUrl, toResourceUri } from "./url.js";

export function sourceMatchesUrl(source: Source, rawUrl: string): boolean {
  const normalized = normalizeUrl(rawUrl);
  const hostname = hostnameFromUrl(normalized);

  if (source.urlPattern.startsWith("domain:")) {
    const expected = source.urlPattern.slice("domain:".length).toLowerCase();
    return hostname === expected || hostname.endsWith(`.${expected}`);
  }

  if (source.urlPattern.startsWith("prefix:")) {
    const expected = source.urlPattern.slice("prefix:".length);
    return normalized.startsWith(expected);
  }

  if (source.urlPattern.includes("*")) {
    const escaped = source.urlPattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
    return new RegExp(`^${escaped}$`).test(normalized);
  }

  return normalized === normalizeUrl(source.urlPattern);
}

export function detectSource(
  request: DetectSiteRequest,
  sources: Source[],
  options: { mcpServerUrl: string }
): DetectSiteResponse {
  const target = canonicalTarget(request.url, request.canonicalUrl);
  const source = sources.find((candidate) => sourceMatchesUrl(candidate, target));

  if (!source) {
    return {
      status: "previewable",
      message: "No stable Source exists, but generic extraction may be available."
    };
  }

  if (source.visibility !== "public" || source.authRequirement !== "none") {
    return {
      status: "restricted",
      sourceId: source.id,
      sourceName: source.name,
      message: "This source requires private configuration or authorization."
    };
  }

  if (source.healthStatus === "failing") {
    return {
      status: "partial",
      sourceId: source.id,
      sourceName: source.name,
      supportScope: source.routeKey ?? "site",
      mcpServerUrl: options.mcpServerUrl,
      resourceUri: toResourceUri("sources", source.id),
      lastRefreshedAt: source.lastSuccessfulRefreshAt,
      message: "This site has MCP support, but the source is currently degraded."
    };
  }

  return {
    status: "available",
    sourceId: source.id,
    sourceName: source.name,
    supportScope: source.routeKey ?? "site",
    mcpServerUrl: options.mcpServerUrl,
    resourceUri: toResourceUri("sources", source.id),
    lastRefreshedAt: source.lastSuccessfulRefreshAt,
    message: "This site is available as an MCP source."
  };
}
