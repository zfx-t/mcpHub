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

export type PluginType = "web_content" | "api" | "custom";

export type ToolEffect = "read" | "write" | "dangerous";

export type CredentialType = "bearer" | "api_key_header" | "api_key_query" | "basic" | "cookie" | "env";

export type AuditStatus = "allowed" | "blocked" | "succeeded" | "failed" | "policy_denied";

export type PlatformErrorCode =
  | "PLUGIN_NOT_FOUND"
  | "PLUGIN_DISABLED"
  | "TOOL_NOT_FOUND"
  | "TOOL_DISABLED"
  | "INVALID_TOOL_INPUT"
  | "POLICY_DENIED"
  | "CONFIRMATION_REQUIRED"
  | "CREDENTIAL_MISSING"
  | "CREDENTIAL_INVALID"
  | "REMOTE_HTTP_ERROR"
  | "REMOTE_TIMEOUT"
  | "PLUGIN_EXECUTION_ERROR"
  | "AUDIT_WRITE_FAILED";

export type PlatformCapability =
  | "http"
  | "executor"
  | "credentials"
  | "policy"
  | "audit"
  | "checkpoint"
  | "local-loader"
  | "plugin-config";

export type StandardDiagnosticSeverity = "info" | "warning" | "error";

export type StandardDiagnosticCode =
  | "PLUGIN_MANIFEST_INVALID"
  | "PLUGIN_COMPATIBILITY_WARNING"
  | "PLUGIN_COMPATIBILITY_ERROR";

export interface PluginCompatibilityMetadata {
  minVersion?: string;
  maxVersion?: string;
  capabilities: string[];
}

export interface StandardDiagnostic {
  severity: StandardDiagnosticSeverity;
  code: StandardDiagnosticCode;
  message: string;
  path?: string;
  suggestion?: string;
  details?: Record<string, unknown>;
}

export interface PluginStandardSummary {
  compatible: boolean;
  warnings: number;
  errors: number;
}

export interface PluginStandardValidationResult extends PluginStandardSummary {
  diagnostics: StandardDiagnostic[];
}

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

export interface Plugin {
  id: string;
  name: string;
  version: string;
  type: PluginType;
  description: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface PluginTool {
  id: string;
  pluginId: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  effect: ToolEffect;
  requiresConfirmation: boolean;
  credentialRefs: string[];
  operation?: PluginToolOperation;
  executor?: PluginToolExecutor;
  enabled: boolean;
}

export interface HttpPluginToolOperation {
  type: "http";
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
}

export type PluginToolOperation = HttpPluginToolOperation;

export interface ModulePluginToolExecutor {
  type: "module";
  handler: string;
}

export type PluginToolExecutor = ModulePluginToolExecutor;

export interface Credential {
  id: string;
  pluginId: string;
  requirementId?: string;
  name: string;
  type: CredentialType;
  secretRef: string;
  scope?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuditRecord {
  id: string;
  requestId: string;
  pluginId: string;
  toolName: string;
  effect: ToolEffect;
  status: AuditStatus;
  target?: string;
  inputSummary?: Record<string, unknown>;
  statusCode?: number;
  durationMs?: number;
  errorCode?: string;
  errorMessage?: string;
  timestamp: string;
}
