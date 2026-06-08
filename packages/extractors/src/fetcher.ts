import type { Fetcher } from "./types.js";

export class HttpFetcher implements Fetcher {
  constructor(private readonly timeoutMs = 10000) {}

  async fetch(url: string): Promise<{ url: string; html: string; fetchedAt: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`Fetch failed with HTTP ${response.status}`);
      }
      return {
        url: response.url || url,
        html: await response.text(),
        fetchedAt: new Date().toISOString()
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class FixtureFetcher implements Fetcher {
  constructor(private readonly fixtures: Record<string, string>) {}

  async fetch(url: string): Promise<{ url: string; html: string; fetchedAt: string }> {
    const html = this.fixtures[url];
    if (!html) {
      throw new Error(`No fixture for ${url}`);
    }
    return { url, html, fetchedAt: new Date().toISOString() };
  }
}
