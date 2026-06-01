import type { DiagnosticRecord, Document, FeedItem, Rule, Source } from "@mcphub/core";

export interface Fetcher {
  fetch(url: string): Promise<{ url: string; html: string; fetchedAt: string }>;
}

export interface ExtractionInput {
  source: Source;
  rule?: Rule;
  url: string;
  html: string;
  fetchedAt: string;
}

export interface ExtractionOutput {
  document: Document;
  items: FeedItem[];
  diagnostics: DiagnosticRecord[];
}

export interface CustomRoute {
  routeKey: string;
  extract(input: ExtractionInput): Promise<ExtractionOutput>;
}

export interface RefreshResult {
  source: Source;
  document?: Document;
  items: FeedItem[];
  diagnostics: DiagnosticRecord[];
  cacheStatus: "fresh" | "refreshed" | "validated";
}
