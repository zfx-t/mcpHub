import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import type {
  AuditRecord,
  AuditStatus,
  Credential,
  DiagnosticRecord,
  Document,
  FeedItem,
  Plugin,
  PluginTool,
  Rule,
  Source,
  SourceSearchFilters
} from "@mcphub/core";
import { sourceMatchesUrl } from "@mcphub/core";
import { redactAuditRecord, type McpHubRepository } from "./repository.js";

export class PostgresRepository implements McpHubRepository {
  readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  async migrate(): Promise<void> {
    await this.pool.query(loadSchemaSql());
  }

  async listPlugins(): Promise<Plugin[]> {
    const result = await this.pool.query("SELECT * FROM plugins ORDER BY name ASC");
    return result.rows.map(rowToPlugin);
  }

  async getPlugin(pluginId: string): Promise<Plugin | undefined> {
    const result = await this.pool.query("SELECT * FROM plugins WHERE id = $1", [pluginId]);
    return result.rows[0] ? rowToPlugin(result.rows[0]) : undefined;
  }

  async upsertPlugin(plugin: Plugin): Promise<void> {
    await this.pool.query(
      `INSERT INTO plugins (
        id, name, version, type, description, enabled, config, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        version = EXCLUDED.version,
        type = EXCLUDED.type,
        description = EXCLUDED.description,
        enabled = EXCLUDED.enabled,
        config = EXCLUDED.config,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`,
      [
        plugin.id,
        plugin.name,
        plugin.version,
        plugin.type,
        plugin.description,
        plugin.enabled,
        jsonb(plugin.config),
        plugin.createdAt,
        plugin.updatedAt
      ]
    );
  }

  async listPluginTools(pluginId?: string): Promise<PluginTool[]> {
    const result = pluginId
      ? await this.pool.query("SELECT * FROM plugin_tools WHERE plugin_id = $1 ORDER BY name ASC", [pluginId])
      : await this.pool.query("SELECT * FROM plugin_tools ORDER BY name ASC");
    return result.rows.map(rowToPluginTool);
  }

  async getPluginTool(toolId: string): Promise<PluginTool | undefined> {
    const result = await this.pool.query("SELECT * FROM plugin_tools WHERE id = $1", [toolId]);
    return result.rows[0] ? rowToPluginTool(result.rows[0]) : undefined;
  }

  async getPluginToolByName(name: string): Promise<PluginTool | undefined> {
    const result = await this.pool.query("SELECT * FROM plugin_tools WHERE name = $1", [name]);
    return result.rows[0] ? rowToPluginTool(result.rows[0]) : undefined;
  }

  async upsertPluginTool(tool: PluginTool): Promise<void> {
    await this.pool.query(
      `INSERT INTO plugin_tools (
        id, plugin_id, name, description, input_schema, effect, requires_confirmation, credential_refs, operation, enabled
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (id) DO UPDATE SET
        plugin_id = EXCLUDED.plugin_id,
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        input_schema = EXCLUDED.input_schema,
        effect = EXCLUDED.effect,
        requires_confirmation = EXCLUDED.requires_confirmation,
        credential_refs = EXCLUDED.credential_refs,
        operation = EXCLUDED.operation,
        enabled = EXCLUDED.enabled`,
      [
        tool.id,
        tool.pluginId,
        tool.name,
        tool.description,
        jsonb(tool.inputSchema),
        tool.effect,
        tool.requiresConfirmation,
        jsonb(tool.credentialRefs),
        jsonb(tool.operation),
        tool.enabled
      ]
    );
  }

  async listCredentials(pluginId?: string): Promise<Credential[]> {
    const result = pluginId
      ? await this.pool.query("SELECT * FROM credentials WHERE plugin_id = $1 ORDER BY name ASC", [pluginId])
      : await this.pool.query("SELECT * FROM credentials ORDER BY name ASC");
    return result.rows.map(rowToCredential);
  }

  async getCredential(credentialId: string): Promise<Credential | undefined> {
    const result = await this.pool.query("SELECT * FROM credentials WHERE id = $1", [credentialId]);
    return result.rows[0] ? rowToCredential(result.rows[0]) : undefined;
  }

  async getCredentialForRequirement(pluginId: string, requirementId: string): Promise<Credential | undefined> {
    const result = await this.pool.query("SELECT * FROM credentials WHERE plugin_id = $1 AND COALESCE(requirement_id, id) = $2", [
      pluginId,
      requirementId
    ]);
    return result.rows[0] ? rowToCredential(result.rows[0]) : undefined;
  }

  async upsertCredential(credential: Credential): Promise<void> {
    await this.pool.query(
      `INSERT INTO credentials (
        id, plugin_id, requirement_id, name, type, secret_ref, scope, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET
        plugin_id = EXCLUDED.plugin_id,
        requirement_id = EXCLUDED.requirement_id,
        name = EXCLUDED.name,
        type = EXCLUDED.type,
        secret_ref = EXCLUDED.secret_ref,
        scope = EXCLUDED.scope,
        created_at = EXCLUDED.created_at,
        updated_at = EXCLUDED.updated_at`,
      [
        credential.id,
        credential.pluginId,
        credential.requirementId,
        credential.name,
        credential.type,
        credential.secretRef,
        credential.scope,
        credential.createdAt,
        credential.updatedAt
      ]
    );
  }

  async listAuditRecords(filter: { pluginId?: string; toolName?: string; status?: AuditStatus } = {}): Promise<AuditRecord[]> {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filter.pluginId) {
      values.push(filter.pluginId);
      clauses.push(`plugin_id = $${values.length}`);
    }
    if (filter.toolName) {
      values.push(filter.toolName);
      clauses.push(`tool_name = $${values.length}`);
    }
    if (filter.status) {
      values.push(filter.status);
      clauses.push(`status = $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.pool.query(`SELECT * FROM audit_records ${where} ORDER BY timestamp ASC`, values);
    return result.rows.map(rowToAuditRecord);
  }

  async addAuditRecord(record: AuditRecord): Promise<void> {
    const safeRecord = redactAuditRecord(record);
    await this.pool.query(
      `INSERT INTO audit_records (
        id, request_id, plugin_id, tool_name, effect, status, target, input_summary,
        status_code, duration_ms, error_code, error_message, timestamp
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO UPDATE SET
        request_id = EXCLUDED.request_id,
        plugin_id = EXCLUDED.plugin_id,
        tool_name = EXCLUDED.tool_name,
        effect = EXCLUDED.effect,
        status = EXCLUDED.status,
        target = EXCLUDED.target,
        input_summary = EXCLUDED.input_summary,
        status_code = EXCLUDED.status_code,
        duration_ms = EXCLUDED.duration_ms,
        error_code = EXCLUDED.error_code,
        error_message = EXCLUDED.error_message,
        timestamp = EXCLUDED.timestamp`,
      [
        safeRecord.id,
        safeRecord.requestId,
        safeRecord.pluginId,
        safeRecord.toolName,
        safeRecord.effect,
        safeRecord.status,
        safeRecord.target,
        jsonb(safeRecord.inputSummary),
        safeRecord.statusCode,
        safeRecord.durationMs,
        safeRecord.errorCode,
        safeRecord.errorMessage,
        safeRecord.timestamp
      ]
    );
  }

  async listSources(filters: SourceSearchFilters = {}): Promise<Source[]> {
    const result = await this.pool.query("SELECT * FROM sources ORDER BY name ASC");
    return result.rows.map(rowToSource).filter((source) => {
      if (filters.visibility && source.visibility !== filters.visibility) {
        return false;
      }
      if (filters.healthStatus && source.healthStatus !== filters.healthStatus) {
        return false;
      }
      if (filters.hostname && !sourceMatchesUrl(source, `https://${filters.hostname}/`)) {
        return false;
      }
      return true;
    });
  }

  async getSource(sourceId: string): Promise<Source | undefined> {
    const result = await this.pool.query("SELECT * FROM sources WHERE id = $1", [sourceId]);
    return result.rows[0] ? rowToSource(result.rows[0]) : undefined;
  }

  async findSourceByUrl(url: string): Promise<Source | undefined> {
    const sources = await this.listSources();
    return sources.find((source) => sourceMatchesUrl(source, url));
  }

  async upsertSource(source: Source): Promise<void> {
    await this.pool.query(
      `INSERT INTO sources (
        id, name, description, url_pattern, route_key, owner, visibility, refresh_policy,
        auth_requirement, risk_flags, health_status, last_successful_refresh_at, last_error,
        failure_count, backoff_until
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        url_pattern = EXCLUDED.url_pattern,
        route_key = EXCLUDED.route_key,
        owner = EXCLUDED.owner,
        visibility = EXCLUDED.visibility,
        refresh_policy = EXCLUDED.refresh_policy,
        auth_requirement = EXCLUDED.auth_requirement,
        risk_flags = EXCLUDED.risk_flags,
        health_status = EXCLUDED.health_status,
        last_successful_refresh_at = EXCLUDED.last_successful_refresh_at,
        last_error = EXCLUDED.last_error,
        failure_count = EXCLUDED.failure_count,
        backoff_until = EXCLUDED.backoff_until`,
      [
        source.id,
        source.name,
        source.description,
        source.urlPattern,
        source.routeKey,
        source.owner,
        source.visibility,
        jsonb(source.refreshPolicy),
        source.authRequirement,
        jsonb(source.riskFlags),
        source.healthStatus,
        source.lastSuccessfulRefreshAt,
        source.lastError,
        source.failureCount,
        source.backoffUntil
      ]
    );
  }

  async updateSourceHealth(
    sourceId: string,
    patch: Partial<Pick<Source, "healthStatus" | "lastSuccessfulRefreshAt" | "lastError" | "failureCount" | "backoffUntil">>
  ): Promise<void> {
    const source = await this.getSource(sourceId);
    if (!source) {
      return;
    }
    await this.upsertSource({ ...source, ...patch });
  }

  async listRules(sourceId?: string): Promise<Rule[]> {
    const result = sourceId
      ? await this.pool.query("SELECT * FROM rules WHERE source_id = $1 ORDER BY id ASC", [sourceId])
      : await this.pool.query("SELECT * FROM rules ORDER BY id ASC");
    return result.rows.map(rowToRule);
  }

  async getRule(ruleId: string): Promise<Rule | undefined> {
    const result = await this.pool.query("SELECT * FROM rules WHERE id = $1", [ruleId]);
    return result.rows[0] ? rowToRule(result.rows[0]) : undefined;
  }

  async upsertRule(rule: Rule): Promise<void> {
    await this.pool.query(
      `INSERT INTO rules (
        id, source_id, type, version, url_pattern, field_mappings, pagination_policy,
        cleaning_policy, sample_urls, confidence, status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (id) DO UPDATE SET
        source_id = EXCLUDED.source_id,
        type = EXCLUDED.type,
        version = EXCLUDED.version,
        url_pattern = EXCLUDED.url_pattern,
        field_mappings = EXCLUDED.field_mappings,
        pagination_policy = EXCLUDED.pagination_policy,
        cleaning_policy = EXCLUDED.cleaning_policy,
        sample_urls = EXCLUDED.sample_urls,
        confidence = EXCLUDED.confidence,
        status = EXCLUDED.status`,
      [
        rule.id,
        rule.sourceId,
        rule.type,
        rule.version,
        rule.urlPattern,
        jsonb(rule.fieldMappings),
        jsonb(rule.paginationPolicy),
        jsonb(rule.cleaningPolicy),
        jsonb(rule.sampleUrls),
        rule.confidence,
        rule.status
      ]
    );
  }

  async listItems(sourceId: string): Promise<FeedItem[]> {
    const result = await this.pool.query("SELECT * FROM feed_items WHERE source_id = $1 ORDER BY published_at DESC NULLS LAST, id ASC", [
      sourceId
    ]);
    return result.rows.map(rowToFeedItem);
  }

  async getItem(itemId: string): Promise<FeedItem | undefined> {
    const result = await this.pool.query("SELECT * FROM feed_items WHERE id = $1", [itemId]);
    return result.rows[0] ? rowToFeedItem(result.rows[0]) : undefined;
  }

  async upsertDocument(document: Document): Promise<void> {
    await this.pool.query(
      `INSERT INTO documents (
        id, source_id, canonical_url, title, content_text, content_html, summary, byline,
        published_at, fetched_at, source_refs, confidence, extraction_warnings
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (id) DO UPDATE SET
        source_id = EXCLUDED.source_id,
        canonical_url = EXCLUDED.canonical_url,
        title = EXCLUDED.title,
        content_text = EXCLUDED.content_text,
        content_html = EXCLUDED.content_html,
        summary = EXCLUDED.summary,
        byline = EXCLUDED.byline,
        published_at = EXCLUDED.published_at,
        fetched_at = EXCLUDED.fetched_at,
        source_refs = EXCLUDED.source_refs,
        confidence = EXCLUDED.confidence,
        extraction_warnings = EXCLUDED.extraction_warnings`,
      [
        document.id,
        document.sourceId,
        document.canonicalUrl,
        document.title,
        document.contentText,
        document.contentHtml,
        document.summary,
        document.byline,
        document.publishedAt,
        document.fetchedAt,
        jsonb(document.sourceRefs),
        document.confidence,
        jsonb(document.extractionWarnings)
      ]
    );
  }

  async getDocument(documentId: string): Promise<Document | undefined> {
    const result = await this.pool.query("SELECT * FROM documents WHERE id = $1", [documentId]);
    return result.rows[0] ? rowToDocument(result.rows[0]) : undefined;
  }

  async upsertFeedItems(items: FeedItem[]): Promise<void> {
    for (const item of items) {
      await this.pool.query(
        `INSERT INTO feed_items (
          id, source_id, document_id, title, url, snippet, content_ref, published_at,
          updated_at, tags, entities, readability_score, diff_hash
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (id) DO UPDATE SET
          source_id = EXCLUDED.source_id,
          document_id = EXCLUDED.document_id,
          title = EXCLUDED.title,
          url = EXCLUDED.url,
          snippet = EXCLUDED.snippet,
          content_ref = EXCLUDED.content_ref,
          published_at = EXCLUDED.published_at,
          updated_at = EXCLUDED.updated_at,
          tags = EXCLUDED.tags,
          entities = EXCLUDED.entities,
          readability_score = EXCLUDED.readability_score,
          diff_hash = EXCLUDED.diff_hash`,
        [
          item.id,
          item.sourceId,
          item.documentId,
          item.title,
          item.url,
          item.snippet,
          item.contentRef,
          item.publishedAt,
          item.updatedAt,
          jsonb(item.tags),
          jsonb(item.entities),
          item.readabilityScore,
          item.diffHash
        ]
      );
    }
  }

  async listDiagnostics(filter: { sourceId?: string; ruleId?: string; itemId?: string } = {}): Promise<DiagnosticRecord[]> {
    const clauses: string[] = [];
    const values: string[] = [];
    if (filter.sourceId) {
      values.push(filter.sourceId);
      clauses.push(`source_id = $${values.length}`);
    }
    if (filter.ruleId) {
      values.push(filter.ruleId);
      clauses.push(`rule_id = $${values.length}`);
    }
    if (filter.itemId) {
      values.push(filter.itemId);
      clauses.push(`item_id = $${values.length}`);
    }
    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    const result = await this.pool.query(`SELECT * FROM diagnostics ${where} ORDER BY timestamp ASC`, values);
    return result.rows.map(rowToDiagnostic);
  }

  async addDiagnostic(record: DiagnosticRecord): Promise<void> {
    await this.pool.query(
      `INSERT INTO diagnostics (
        id, source_id, rule_id, item_id, url, code, message, extraction_method,
        timestamp, retryable, suggested_next_action, details
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      ON CONFLICT (id) DO UPDATE SET
        source_id = EXCLUDED.source_id,
        rule_id = EXCLUDED.rule_id,
        item_id = EXCLUDED.item_id,
        url = EXCLUDED.url,
        code = EXCLUDED.code,
        message = EXCLUDED.message,
        extraction_method = EXCLUDED.extraction_method,
        timestamp = EXCLUDED.timestamp,
        retryable = EXCLUDED.retryable,
        suggested_next_action = EXCLUDED.suggested_next_action,
        details = EXCLUDED.details`,
      [
        record.id,
        record.sourceId,
        record.ruleId,
        record.itemId,
        record.url,
        record.code,
        record.message,
        record.extractionMethod,
        record.timestamp,
        record.retryable,
        record.suggestedNextAction,
        jsonb(record.details)
      ]
    );
  }
}

function loadSchemaSql(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [join(here, "schema.sql"), join(here, "../src/schema.sql")];
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
  }
  throw new Error("Unable to locate schema.sql");
}

function rowToSource(row: any): Source {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    urlPattern: row.url_pattern,
    routeKey: row.route_key ?? undefined,
    owner: row.owner,
    visibility: row.visibility,
    refreshPolicy: row.refresh_policy,
    authRequirement: row.auth_requirement,
    riskFlags: row.risk_flags,
    healthStatus: row.health_status,
    lastSuccessfulRefreshAt: toIso(row.last_successful_refresh_at),
    lastError: row.last_error ?? undefined,
    failureCount: row.failure_count,
    backoffUntil: toIso(row.backoff_until)
  };
}

function rowToPlugin(row: any): Plugin {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    type: row.type,
    description: row.description,
    enabled: row.enabled,
    config: row.config,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function rowToPluginTool(row: any): PluginTool {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    name: row.name,
    description: row.description,
    inputSchema: row.input_schema,
    effect: row.effect,
    requiresConfirmation: row.requires_confirmation,
    credentialRefs: row.credential_refs,
    operation: row.operation ?? undefined,
    enabled: row.enabled
  };
}

function rowToCredential(row: any): Credential {
  return {
    id: row.id,
    pluginId: row.plugin_id,
    requirementId: row.requirement_id ?? undefined,
    name: row.name,
    type: row.type,
    secretRef: row.secret_ref,
    scope: row.scope ?? undefined,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at)
  };
}

function rowToAuditRecord(row: any): AuditRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    pluginId: row.plugin_id,
    toolName: row.tool_name,
    effect: row.effect,
    status: row.status,
    target: row.target ?? undefined,
    inputSummary: row.input_summary ?? undefined,
    statusCode: row.status_code ?? undefined,
    durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
    errorCode: row.error_code ?? undefined,
    errorMessage: row.error_message ?? undefined,
    timestamp: toIso(row.timestamp) ?? new Date().toISOString()
  };
}

function rowToRule(row: any): Rule {
  return {
    id: row.id,
    sourceId: row.source_id,
    type: row.type,
    version: row.version,
    urlPattern: row.url_pattern,
    fieldMappings: row.field_mappings,
    paginationPolicy: row.pagination_policy ?? undefined,
    cleaningPolicy: row.cleaning_policy ?? undefined,
    sampleUrls: row.sample_urls,
    confidence: Number(row.confidence),
    status: row.status
  };
}

function rowToDocument(row: any): Document {
  return {
    id: row.id,
    sourceId: row.source_id,
    canonicalUrl: row.canonical_url,
    title: row.title,
    contentText: row.content_text,
    contentHtml: row.content_html ?? undefined,
    summary: row.summary ?? undefined,
    byline: row.byline ?? undefined,
    publishedAt: toIso(row.published_at),
    fetchedAt: toIso(row.fetched_at) ?? new Date().toISOString(),
    sourceRefs: row.source_refs,
    confidence: Number(row.confidence),
    extractionWarnings: row.extraction_warnings
  };
}

function rowToFeedItem(row: any): FeedItem {
  return {
    id: row.id,
    sourceId: row.source_id,
    documentId: row.document_id,
    title: row.title,
    url: row.url,
    snippet: row.snippet,
    contentRef: row.content_ref,
    publishedAt: toIso(row.published_at),
    updatedAt: toIso(row.updated_at),
    tags: row.tags,
    entities: row.entities,
    readabilityScore: row.readability_score === null ? undefined : Number(row.readability_score),
    diffHash: row.diff_hash
  };
}

function rowToDiagnostic(row: any): DiagnosticRecord {
  return {
    id: row.id,
    sourceId: row.source_id ?? undefined,
    ruleId: row.rule_id ?? undefined,
    itemId: row.item_id ?? undefined,
    url: row.url ?? undefined,
    code: row.code,
    message: row.message,
    extractionMethod: row.extraction_method ?? undefined,
    timestamp: toIso(row.timestamp) ?? new Date().toISOString(),
    retryable: row.retryable,
    suggestedNextAction: row.suggested_next_action,
    details: row.details ?? undefined
  };
}

function toIso(value: unknown): string | undefined {
  if (!value) {
    return undefined;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  return String(value);
}

function jsonb(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}
