import type { DetectSiteRequest } from "./types.js";

export function collectPageMetadata(): Omit<DetectSiteRequest, "url" | "hostname"> {
  const canonical = document.querySelector<HTMLLinkElement>("link[rel='canonical']")?.href;
  const description =
    document.querySelector<HTMLMetaElement>("meta[name='description']")?.content ||
    document.querySelector<HTMLMetaElement>("meta[property='og:description']")?.content ||
    undefined;

  return {
    title: document.title || undefined,
    canonicalUrl: canonical || undefined,
    metaDescription: description,
    language: document.documentElement.lang || undefined
  };
}

export function buildDetectionPayload(tabUrl: string, page: Omit<DetectSiteRequest, "url" | "hostname">): DetectSiteRequest {
  const url = new URL(tabUrl);
  return {
    url: tabUrl,
    hostname: url.hostname,
    ...page
  };
}
