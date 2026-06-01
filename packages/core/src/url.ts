const TRACKING_PARAMS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid"
];

export function normalizeUrl(input: string): string {
  const url = new URL(input);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();

  for (const param of TRACKING_PARAMS) {
    url.searchParams.delete(param);
  }

  const sorted = [...url.searchParams.entries()].sort(([a], [b]) => a.localeCompare(b));
  url.search = "";
  for (const [key, value] of sorted) {
    url.searchParams.append(key, value);
  }

  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}

export function hostnameFromUrl(input: string): string {
  return new URL(input).hostname.toLowerCase();
}

export function canonicalTarget(url: string, canonicalUrl?: string): string {
  return normalizeUrl(canonicalUrl || url);
}

export function toResourceUri(kind: "sources" | "items" | "rules", id?: string, suffix?: string): string {
  const parts = [`webmcp://${kind}`];
  if (id) {
    parts.push(id);
  }
  if (suffix) {
    parts.push(suffix);
  }
  return parts.join("/");
}
