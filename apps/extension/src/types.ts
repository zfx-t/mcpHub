export interface DetectSiteRequest {
  url: string;
  hostname: string;
  title?: string;
  canonicalUrl?: string;
  metaDescription?: string;
  language?: string;
}

export interface DetectSiteResponse {
  status: "available" | "partial" | "previewable" | "unsupported" | "restricted" | "error";
  sourceId?: string;
  sourceName?: string;
  supportScope?: string;
  mcpServerUrl?: string;
  resourceUri?: string;
  lastRefreshedAt?: string;
  message: string;
}
