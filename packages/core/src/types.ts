export type Visibility = "public" | "private";

export type AuthRequirement = "none" | "required" | "unsupported";

export type HealthStatus = "healthy" | "degraded" | "failing" | "unknown";

export type RuleType = "generic" | "validated" | "custom_route";

export type RuleStatus = "active" | "draft" | "disabled" | "failing";

export type DetectionStatus =
  | "available"
  | "partial"
  | "previewable"
  | "unsupported"
  | "restricted"
  | "error";

export type RefreshMode = "cached" | "force" | "validate_only";

export type ExtractionMethod = "custom_route" | "validated_rule" | "generic";

export interface RefreshPolicy {
  ttlSeconds: number;
  staleWhileRevalidateSeconds?: number;
}

export interface Source {
  id: string;
  name: string;
  description: string;
  urlPattern: string;
  routeKey?: string;
  owner: string;
  visibility: Visibility;
  refreshPolicy: RefreshPolicy;
  authRequirement: AuthRequirement;
  riskFlags: string[];
  healthStatus: HealthStatus;
  lastSuccessfulRefreshAt?: string;
  lastError?: string;
  failureCount: number;
  backoffUntil?: string;
}

export interface Rule {
  id: string;
  sourceId: string;
  type: RuleType;
  version: number;
  urlPattern: string;
  fieldMappings: Record<string, string>;
  paginationPolicy?: Record<string, unknown>;
  cleaningPolicy?: Record<string, unknown>;
  sampleUrls: string[];
  confidence: number;
  status: RuleStatus;
}

export interface Document {
  id: string;
  sourceId: string;
  canonicalUrl: string;
  title: string;
  contentText: string;
  contentHtml?: string;
  summary?: string;
  byline?: string;
  publishedAt?: string;
  fetchedAt: string;
  sourceRefs: string[];
  confidence: number;
  extractionWarnings: string[];
}

export interface FeedItem {
  id: string;
  sourceId: string;
  documentId: string;
  title: string;
  url: string;
  snippet: string;
  contentRef: string;
  publishedAt?: string;
  updatedAt?: string;
  tags: string[];
  entities: string[];
  readabilityScore?: number;
  diffHash: string;
}

export interface DiagnosticRecord {
  id: string;
  sourceId?: string;
  ruleId?: string;
  itemId?: string;
  url?: string;
  code: ErrorCode;
  message: string;
  extractionMethod?: ExtractionMethod;
  timestamp: string;
  retryable: boolean;
  suggestedNextAction: string;
  details?: Record<string, unknown>;
}

export type ErrorCode =
  | "FETCH_BLOCKED"
  | "FETCH_TIMEOUT"
  | "RULE_MISMATCH"
  | "EXTRACTION_LOW_CONFIDENCE"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "UNSUPPORTED_SITE"
  | "ROBOTS_OR_POLICY_BLOCKED";

export interface DetectSiteRequest {
  url: string;
  hostname: string;
  title?: string;
  canonicalUrl?: string;
  metaDescription?: string;
  language?: string;
}

export interface DetectSiteResponse {
  status: DetectionStatus;
  sourceId?: string;
  sourceName?: string;
  supportScope?: string;
  mcpServerUrl?: string;
  resourceUri?: string;
  lastRefreshedAt?: string;
  message: string;
}

export interface SourceSearchFilters {
  visibility?: Visibility;
  healthStatus?: HealthStatus;
  hostname?: string;
}
