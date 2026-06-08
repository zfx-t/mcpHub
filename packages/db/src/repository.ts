import type {
  AuditRecord,
  AuditStatus,
  Credential,
  DiagnosticRecord,
  Document,
  FeedItem,
  HealthStatus,
  Plugin,
  PluginTool,
  Rule,
  Source,
  SourceSearchFilters
} from "@mcphub/core";
import { hostnameFromUrl, sourceMatchesUrl } from "@mcphub/core";

export interface McpHubRepository {
  listPlugins(): Promise<Plugin[]>;
  getPlugin(pluginId: string): Promise<Plugin | undefined>;
  upsertPlugin(plugin: Plugin): Promise<void>;
  listPluginTools(pluginId?: string): Promise<PluginTool[]>;
  getPluginTool(toolId: string): Promise<PluginTool | undefined>;
  getPluginToolByName(name: string): Promise<PluginTool | undefined>;
  upsertPluginTool(tool: PluginTool): Promise<void>;
  listCredentials(pluginId?: string): Promise<Credential[]>;
  getCredential(credentialId: string): Promise<Credential | undefined>;
  getCredentialForRequirement(pluginId: string, requirementId: string): Promise<Credential | undefined>;
  upsertCredential(credential: Credential): Promise<void>;
  listAuditRecords(filter?: { pluginId?: string; toolName?: string; status?: AuditStatus }): Promise<AuditRecord[]>;
  addAuditRecord(record: AuditRecord): Promise<void>;
  listSources(filters?: SourceSearchFilters): Promise<Source[]>;
  getSource(sourceId: string): Promise<Source | undefined>;
  findSourceByUrl(url: string): Promise<Source | undefined>;
  upsertSource(source: Source): Promise<void>;
  updateSourceHealth(sourceId: string, patch: Partial<Pick<Source, "healthStatus" | "lastSuccessfulRefreshAt" | "lastError" | "failureCount" | "backoffUntil">>): Promise<void>;
  listRules(sourceId?: string): Promise<Rule[]>;
  getRule(ruleId: string): Promise<Rule | undefined>;
  upsertRule(rule: Rule): Promise<void>;
  listItems(sourceId: string): Promise<FeedItem[]>;
  getItem(itemId: string): Promise<FeedItem | undefined>;
  upsertDocument(document: Document): Promise<void>;
  getDocument(documentId: string): Promise<Document | undefined>;
  upsertFeedItems(items: FeedItem[]): Promise<void>;
  listDiagnostics(filter?: { sourceId?: string; ruleId?: string; itemId?: string }): Promise<DiagnosticRecord[]>;
  addDiagnostic(record: DiagnosticRecord): Promise<void>;
}

export class MemoryRepository implements McpHubRepository {
  private readonly plugins = new Map<string, Plugin>();
  private readonly pluginTools = new Map<string, PluginTool>();
  private readonly credentials = new Map<string, Credential>();
  private readonly auditRecords = new Map<string, AuditRecord>();
  private readonly sources = new Map<string, Source>();
  private readonly rules = new Map<string, Rule>();
  private readonly documents = new Map<string, Document>();
  private readonly items = new Map<string, FeedItem>();
  private readonly diagnostics = new Map<string, DiagnosticRecord>();

  constructor(seed?: {
    plugins?: Plugin[];
    pluginTools?: PluginTool[];
    credentials?: Credential[];
    auditRecords?: AuditRecord[];
    sources?: Source[];
    rules?: Rule[];
    documents?: Document[];
    items?: FeedItem[];
  }) {
    for (const plugin of seed?.plugins ?? []) {
      this.plugins.set(plugin.id, plugin);
    }
    for (const tool of seed?.pluginTools ?? []) {
      this.pluginTools.set(tool.id, tool);
    }
    for (const credential of seed?.credentials ?? []) {
      this.credentials.set(credential.id, credential);
    }
    for (const record of seed?.auditRecords ?? []) {
      this.auditRecords.set(record.id, record);
    }
    for (const source of seed?.sources ?? []) {
      this.sources.set(source.id, source);
    }
    for (const rule of seed?.rules ?? []) {
      this.rules.set(rule.id, rule);
    }
    for (const document of seed?.documents ?? []) {
      this.documents.set(document.id, document);
    }
    for (const item of seed?.items ?? []) {
      this.items.set(item.id, item);
    }
  }

  async listPlugins(): Promise<Plugin[]> {
    return [...this.plugins.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async getPlugin(pluginId: string): Promise<Plugin | undefined> {
    return this.plugins.get(pluginId);
  }

  async upsertPlugin(plugin: Plugin): Promise<void> {
    this.plugins.set(plugin.id, plugin);
  }

  async listPluginTools(pluginId?: string): Promise<PluginTool[]> {
    return [...this.pluginTools.values()]
      .filter((tool) => !pluginId || tool.pluginId === pluginId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getPluginTool(toolId: string): Promise<PluginTool | undefined> {
    return this.pluginTools.get(toolId);
  }

  async getPluginToolByName(name: string): Promise<PluginTool | undefined> {
    return [...this.pluginTools.values()].find((tool) => tool.name === name);
  }

  async upsertPluginTool(tool: PluginTool): Promise<void> {
    if (!this.plugins.has(tool.pluginId)) {
      throw new Error(`Unknown plugin ${tool.pluginId}`);
    }
    const duplicate = [...this.pluginTools.values()].find((candidate) => candidate.name === tool.name && candidate.id !== tool.id);
    if (duplicate) {
      throw new Error(`Duplicate plugin tool name ${tool.name}`);
    }
    this.pluginTools.set(tool.id, tool);
  }

  async listCredentials(pluginId?: string): Promise<Credential[]> {
    return [...this.credentials.values()]
      .filter((credential) => !pluginId || credential.pluginId === pluginId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  async getCredential(credentialId: string): Promise<Credential | undefined> {
    return this.credentials.get(credentialId);
  }

  async getCredentialForRequirement(pluginId: string, requirementId: string): Promise<Credential | undefined> {
    return [...this.credentials.values()].find(
      (credential) => credential.pluginId === pluginId && (credential.requirementId ?? credential.id) === requirementId
    );
  }

  async upsertCredential(credential: Credential): Promise<void> {
    if (!this.plugins.has(credential.pluginId)) {
      throw new Error(`Unknown plugin ${credential.pluginId}`);
    }
    this.credentials.set(credential.id, credential);
  }

  async listAuditRecords(filter: { pluginId?: string; toolName?: string; status?: AuditStatus } = {}): Promise<AuditRecord[]> {
    return [...this.auditRecords.values()]
      .filter((record) => {
        if (filter.pluginId && record.pluginId !== filter.pluginId) {
          return false;
        }
        if (filter.toolName && record.toolName !== filter.toolName) {
          return false;
        }
        if (filter.status && record.status !== filter.status) {
          return false;
        }
        return true;
      })
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }

  async addAuditRecord(record: AuditRecord): Promise<void> {
    if (!this.plugins.has(record.pluginId)) {
      throw new Error(`Unknown plugin ${record.pluginId}`);
    }
    const safeRecord = redactAuditRecord(record);
    this.auditRecords.set(safeRecord.id, safeRecord);
  }

  async listSources(filters: SourceSearchFilters = {}): Promise<Source[]> {
    return [...this.sources.values()].filter((source) => {
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
    return this.sources.get(sourceId);
  }

  async findSourceByUrl(url: string): Promise<Source | undefined> {
    return [...this.sources.values()].find((source) => sourceMatchesUrl(source, url));
  }

  async upsertSource(source: Source): Promise<void> {
    this.sources.set(source.id, source);
  }

  async updateSourceHealth(
    sourceId: string,
    patch: Partial<Pick<Source, "healthStatus" | "lastSuccessfulRefreshAt" | "lastError" | "failureCount" | "backoffUntil">>
  ): Promise<void> {
    const source = this.sources.get(sourceId);
    if (!source) {
      return;
    }
    this.sources.set(sourceId, { ...source, ...patch });
  }

  async listRules(sourceId?: string): Promise<Rule[]> {
    return [...this.rules.values()].filter((rule) => !sourceId || rule.sourceId === sourceId);
  }

  async getRule(ruleId: string): Promise<Rule | undefined> {
    return this.rules.get(ruleId);
  }

  async upsertRule(rule: Rule): Promise<void> {
    this.rules.set(rule.id, rule);
  }

  async listItems(sourceId: string): Promise<FeedItem[]> {
    return [...this.items.values()].filter((item) => item.sourceId === sourceId);
  }

  async getItem(itemId: string): Promise<FeedItem | undefined> {
    return this.items.get(itemId);
  }

  async upsertDocument(document: Document): Promise<void> {
    this.documents.set(document.id, document);
  }

  async getDocument(documentId: string): Promise<Document | undefined> {
    return this.documents.get(documentId);
  }

  async upsertFeedItems(items: FeedItem[]): Promise<void> {
    for (const item of items) {
      this.items.set(item.id, item);
    }
  }

  async listDiagnostics(filter: { sourceId?: string; ruleId?: string; itemId?: string } = {}): Promise<DiagnosticRecord[]> {
    return [...this.diagnostics.values()].filter((diagnostic) => {
      if (filter.sourceId && diagnostic.sourceId !== filter.sourceId) {
        return false;
      }
      if (filter.ruleId && diagnostic.ruleId !== filter.ruleId) {
        return false;
      }
      if (filter.itemId && diagnostic.itemId !== filter.itemId) {
        return false;
      }
      return true;
    });
  }

  async addDiagnostic(record: DiagnosticRecord): Promise<void> {
    this.diagnostics.set(record.id, record);
  }
}

export function hostHealth(source: Source): HealthStatus {
  if (source.authRequirement !== "none") {
    return "degraded";
  }
  try {
    hostnameFromUrl(source.urlPattern.replace(/^domain:/, "https://"));
    return source.healthStatus;
  } catch {
    return "unknown";
  }
}

const sensitiveKeyPattern = /token|secret|password|authorization|cookie|api[_-]?key/i;
const sensitiveTextPattern = /((?:token|secret|password|authorization|cookie|api[_-]?key)=)[^&\s]+/gi;
const bearerPattern = /(bearer\s+)[a-z0-9._~+/=-]+/gi;

export function redactAuditRecord(record: AuditRecord): AuditRecord {
  return {
    ...record,
    target: record.target ? redactText(record.target) : undefined,
    inputSummary: record.inputSummary ? (redactValue(record.inputSummary) as Record<string, unknown>) : undefined,
    errorMessage: record.errorMessage ? redactText(record.errorMessage) : undefined
  };
}

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => redactValue(entry));
  }
  if (!value || typeof value !== "object") {
    return typeof value === "string" ? redactText(value) : value;
  }
  const redacted: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPattern.test(key)) {
      redacted[key] = "[REDACTED]";
    } else {
      redacted[key] = redactValue(entry);
    }
  }
  return redacted;
}

function redactText(value: string): string {
  return value.replace(sensitiveTextPattern, "$1[REDACTED]").replace(bearerPattern, "$1[REDACTED]");
}
