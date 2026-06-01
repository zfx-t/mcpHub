import type { DiagnosticRecord, Document, FeedItem, HealthStatus, Rule, Source, SourceSearchFilters } from "@mcphub/core";
import { hostnameFromUrl, sourceMatchesUrl } from "@mcphub/core";

export interface McpHubRepository {
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
  private readonly sources = new Map<string, Source>();
  private readonly rules = new Map<string, Rule>();
  private readonly documents = new Map<string, Document>();
  private readonly items = new Map<string, FeedItem>();
  private readonly diagnostics = new Map<string, DiagnosticRecord>();

  constructor(seed?: { sources?: Source[]; rules?: Rule[]; documents?: Document[]; items?: FeedItem[] }) {
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
