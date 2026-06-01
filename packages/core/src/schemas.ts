import { z } from "zod";

export const refreshPolicySchema = z.object({
  ttlSeconds: z.number().int().positive(),
  staleWhileRevalidateSeconds: z.number().int().nonnegative().optional()
});

export const sourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  urlPattern: z.string().min(1),
  routeKey: z.string().optional(),
  owner: z.string().min(1),
  visibility: z.enum(["public", "private"]),
  refreshPolicy: refreshPolicySchema,
  authRequirement: z.enum(["none", "required", "unsupported"]),
  riskFlags: z.array(z.string()),
  healthStatus: z.enum(["healthy", "degraded", "failing", "unknown"]),
  lastSuccessfulRefreshAt: z.string().datetime().optional(),
  lastError: z.string().optional(),
  failureCount: z.number().int().nonnegative(),
  backoffUntil: z.string().datetime().optional()
});

export const ruleSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  type: z.enum(["generic", "validatedd", "custom_route"]),
  version: z.number().int().positive(),
  urlPattern: z.string().min(1),
  fieldMappings: z.record(z.string()),
  paginationPolicy: z.record(z.unknown()).optional(),
  cleaningPolicy: z.record(z.unknown()).optional(),
  sampleUrls: z.array(z.string().url()),
  confidence: z.number().min(0).max(1),
  status: z.enum(["active", "draft", "disabled", "failing"])
});

export const documentSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  canonicalUrl: z.string().url(),
  title: z.string().min(1),
  contentText: z.string(),
  contentHtml: z.string().optional(),
  summary: z.string().optional(),
  byline: z.string().optional(),
  publishedAt: z.string().datetime().optional(),
  fetchedAt: z.string().datetime(),
  sourceRefs: z.array(z.string().url()),
  confidence: z.number().min(0).max(1),
  extractionWarnings: z.array(z.string())
});

export const feedItemSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  documentId: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  snippet: z.string(),
  contentRef: z.string().min(1),
  publishedAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional(),
  tags: z.array(z.string()),
  entities: z.array(z.string()),
  readabilityScore: z.number().min(0).max(1).optional(),
  diffHash: z.string().min(1)
});

export const detectSiteRequestSchema = z.object({
  url: z.string().url(),
  hostname: z.string().min(1),
  title: z.string().optional(),
  canonicalUrl: z.string().url().optional(),
  metaDescription: z.string().optional(),
  language: z.string().optional()
});

export const sourceSearchFiltersSchema = z.object({
  visibility: z.enum(["public", "private"]).optional(),
  healthStatus: z.enum(["healthy", "degraded", "failing", "unknown"]).optional(),
  hostname: z.string().optional()
});
