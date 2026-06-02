import type { AuditRecord, AuditStatus, PlatformErrorCode, PluginTool, ToolEffect } from "@mcphub/core";
import type { McpHubRepository } from "@mcphub/db";

export interface AuditLoggerOptions {
  repository: McpHubRepository;
  now?: () => Date;
  idFactory?: () => string;
}

export interface ToolAuditInput {
  requestId: string;
  pluginId: string;
  toolName: string;
  effect: ToolEffect;
  status: AuditStatus;
  target?: string;
  inputSummary?: Record<string, unknown>;
  statusCode?: number;
  durationMs?: number;
  errorCode?: PlatformErrorCode | string;
  errorMessage?: string;
}

export class AuditLogger {
  private readonly repository: McpHubRepository;
  private readonly now: () => Date;
  private readonly idFactory: () => string;

  constructor(options: AuditLoggerOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? (() => crypto.randomUUID());
  }

  async recordToolCall(input: ToolAuditInput): Promise<AuditRecord> {
    const record = auditRecordFromInput(input, this.idFactory(), this.now());
    await this.repository.addAuditRecord(record);
    return record;
  }

  async recent(limit = 20): Promise<AuditRecord[]> {
    const records = await this.repository.listAuditRecords();
    return records.slice(-limit).reverse();
  }
}

export function auditRecordFromInput(input: ToolAuditInput, id: string, timestamp: Date): AuditRecord {
  return {
    id,
    requestId: input.requestId,
    pluginId: input.pluginId,
    toolName: input.toolName,
    effect: input.effect,
    status: input.status,
    target: input.target,
    inputSummary: input.inputSummary,
    statusCode: input.statusCode,
    durationMs: input.durationMs,
    errorCode: input.errorCode,
    errorMessage: input.errorMessage,
    timestamp: timestamp.toISOString()
  };
}

export function toolAuditInput(
  requestId: string,
  tool: PluginTool,
  status: AuditStatus,
  patch: Omit<Partial<ToolAuditInput>, "requestId" | "pluginId" | "toolName" | "effect" | "status"> = {}
): ToolAuditInput {
  return {
    requestId,
    pluginId: tool.pluginId,
    toolName: tool.name,
    effect: tool.effect,
    status,
    ...patch
  };
}
