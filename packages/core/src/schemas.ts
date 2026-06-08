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
  type: z.enum(["generic", "validated", "custom_route"]),
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

export const pluginIdSchema = z.string().regex(/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)*$/, {
  message: "Plugin IDs must be lowercase slug or dotted lowercase identifiers."
});

export const pluginToolNameSchema = z.string().regex(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/, {
  message: "Tool names must use lowercase dot-separated namespaces."
});

export const httpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const pluginToolOperationSchema = z.object({
  type: z.literal("http"),
  method: httpMethodSchema,
  path: z.string().regex(/^\//, { message: "HTTP operation paths must start with /." })
});

export const pluginToolExecutorSchema = z.object({
  type: z.literal("module"),
  handler: z.string().min(1)
});

export const toolEffectSchema = z.enum(["read", "write", "dangerous"]);

export const credentialTypeSchema = z.enum(["bearer", "api_key_header", "api_key_query", "basic", "cookie", "env"]);

export const auditStatusSchema = z.enum(["allowed", "blocked", "succeeded", "failed", "policy_denied"]);

export const platformCapabilitySchema = z.enum([
  "http",
  "executor",
  "credentials",
  "policy",
  "audit",
  "checkpoint",
  "local-loader",
  "plugin-config"
]);

export const platformErrorCodeSchema = z.enum([
  "PLUGIN_NOT_FOUND",
  "PLUGIN_DISABLED",
  "TOOL_NOT_FOUND",
  "TOOL_DISABLED",
  "INVALID_TOOL_INPUT",
  "POLICY_DENIED",
  "CONFIRMATION_REQUIRED",
  "CREDENTIAL_MISSING",
  "CREDENTIAL_INVALID",
  "REMOTE_HTTP_ERROR",
  "REMOTE_TIMEOUT",
  "PLUGIN_EXECUTION_ERROR",
  "AUDIT_WRITE_FAILED"
]);

export const pluginSchema = z.object({
  id: pluginIdSchema,
  name: z.string().min(1),
  version: z.string().min(1),
  type: z.enum(["web_content", "api", "custom"]),
  description: z.string(),
  enabled: z.boolean(),
  config: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export const pluginToolSchema = z.object({
  id: z.string().min(1),
  pluginId: pluginIdSchema,
  name: pluginToolNameSchema,
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()),
  effect: toolEffectSchema,
  requiresConfirmation: z.boolean(),
  credentialRefs: z.array(z.string().min(1)).default([]),
  operation: pluginToolOperationSchema.optional(),
  executor: pluginToolExecutorSchema.optional(),
  enabled: z.boolean()
}).superRefine(refineToolExecutionMode);

export const credentialSchema = z.object({
  id: z.string().min(1),
  pluginId: pluginIdSchema,
  requirementId: z.string().min(1).optional(),
  name: z.string().min(1),
  type: credentialTypeSchema,
  secretRef: z.string().min(1),
  scope: z.string().optional(),
  createdAt: z.string().datetime().optional(),
  updatedAt: z.string().datetime().optional()
});

export const auditRecordSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  pluginId: pluginIdSchema,
  toolName: pluginToolNameSchema,
  effect: toolEffectSchema,
  status: auditStatusSchema,
  target: z.string().optional(),
  inputSummary: z.record(z.unknown()).optional(),
  statusCode: z.number().int().positive().optional(),
  durationMs: z.number().nonnegative().optional(),
  errorCode: z.string().optional(),
  errorMessage: z.string().optional(),
  timestamp: z.string().datetime()
});

export const pluginCredentialRequirementSchema = z.object({
  id: z.string().min(1),
  type: credentialTypeSchema,
  description: z.string().optional()
});

export const pluginToolDefinitionSchema = z.object({
  name: pluginToolNameSchema,
  description: z.string().min(1),
  inputSchema: z.record(z.unknown()),
  effect: toolEffectSchema,
  requiresConfirmation: z.boolean().optional(),
  credentialRefs: z.array(z.string().min(1)).default([]),
  operation: pluginToolOperationSchema.optional(),
  executor: pluginToolExecutorSchema.optional()
}).superRefine(refineToolExecutionMode);

function refineToolExecutionMode(tool: { operation?: unknown; executor?: unknown }, context: z.RefinementCtx): void {
  if (tool.operation && tool.executor) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Plugin tools must define either operation or executor, not both.",
      path: ["executor"]
    });
    return;
  }
  if (!tool.operation && !tool.executor) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Plugin tools must define either operation or executor.",
      path: ["operation"]
    });
  }
}

export const pluginManifestSchema = z
  .object({
    id: pluginIdSchema,
    name: z.string().min(1),
    version: z.string().min(1),
    type: z.enum(["web_content", "api", "custom"]),
    description: z.string(),
    homepage: z.string().url().optional(),
    author: z.string().min(1).optional(),
    license: z.string().min(1).optional(),
    tags: z.array(z.string().regex(/^[a-z][a-z0-9-]*$/)).default([]),
    mcphub: z
      .object({
        minVersion: z.string().min(1).optional(),
        maxVersion: z.string().min(1).optional(),
        capabilities: z.array(z.string().min(1)).default([])
      })
      .optional(),
    configSchema: z.record(z.unknown()).optional(),
    credentials: z.array(pluginCredentialRequirementSchema).default([]),
    tools: z.array(pluginToolDefinitionSchema).default([])
  })
  .superRefine((manifest, context) => {
    const seenTools = new Set<string>();
    const credentialIds = new Set(manifest.credentials.map((credential) => credential.id));
    for (const [index, tool] of manifest.tools.entries()) {
      if (seenTools.has(tool.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate tool name ${tool.name}`,
          path: ["tools", index, "name"]
        });
      }
      seenTools.add(tool.name);
      for (const [credentialIndex, credentialRef] of tool.credentialRefs.entries()) {
        if (!credentialIds.has(credentialRef)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Unknown credential reference ${credentialRef}`,
            path: ["tools", index, "credentialRefs", credentialIndex]
          });
        }
      }
    }
  });
