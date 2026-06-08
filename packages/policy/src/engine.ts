import type { PlatformErrorCode, Plugin, PluginTool } from "@mcphub/core";

export interface ToolCallTarget {
  url?: string;
  method?: string;
  path?: string;
}

export type DangerousMode = "block" | "auditOnly" | "allow";

export interface PolicyConfig {
  dangerousMode?: DangerousMode;
  allowedHosts?: string[];
  allowedMethods?: string[];
  allowedPathPatterns?: string[];
}

export interface PolicyEvaluationInput {
  plugin?: Plugin;
  tool?: PluginTool;
  target?: ToolCallTarget;
  confirmationToken?: string;
  policy?: PolicyConfig;
}

export type PolicyDecision =
  | { allowed: true; status: "allowed"; code?: undefined; message?: undefined }
  | { allowed: false; status: "blocked" | "policy_denied"; code: PlatformErrorCode; message: string };

export function evaluateToolPolicy(input: PolicyEvaluationInput): PolicyDecision {
  const { plugin, tool, policy = {} } = input;
  if (!plugin) {
    return denied("blocked", "PLUGIN_NOT_FOUND", "Plugin was not found.");
  }
  if (!plugin.enabled) {
    return denied("blocked", "PLUGIN_DISABLED", `Plugin ${plugin.id} is disabled.`);
  }
  if (!tool) {
    return denied("blocked", "TOOL_NOT_FOUND", "Tool was not found.");
  }
  if (!tool.enabled) {
    return denied("blocked", "TOOL_DISABLED", `Tool ${tool.name} is disabled.`);
  }

  const targetDecision = evaluateTarget(input.target, policy);
  if (!targetDecision.allowed) {
    return targetDecision;
  }

  if (tool.effect === "read") {
    return { allowed: true, status: "allowed" };
  }

  if (tool.effect === "write") {
    return { allowed: true, status: "allowed" };
  }

  const dangerousMode = policy.dangerousMode ?? "auditOnly";
  if (dangerousMode === "block") {
    return denied("blocked", "CONFIRMATION_REQUIRED", `Dangerous tool ${tool.name} requires explicit confirmation.`);
  }
  return { allowed: true, status: "allowed" };
}

function evaluateTarget(target: ToolCallTarget | undefined, policy: PolicyConfig): PolicyDecision {
  if (!target) {
    return { allowed: true, status: "allowed" };
  }
  if (policy.allowedHosts?.length && target.url) {
    const host = hostFromUrl(target.url);
    if (!host || !policy.allowedHosts.includes(host)) {
      return denied("policy_denied", "POLICY_DENIED", `Target host ${host ?? "unknown"} is not allowed.`);
    }
  }
  if (policy.allowedMethods?.length && target.method && !policy.allowedMethods.includes(target.method.toUpperCase())) {
    return denied("policy_denied", "POLICY_DENIED", `HTTP method ${target.method} is not allowed.`);
  }
  if (policy.allowedPathPatterns?.length && target.path && !policy.allowedPathPatterns.some((pattern) => pathMatches(pattern, target.path ?? ""))) {
    return denied("policy_denied", "POLICY_DENIED", `Target path ${target.path} is not allowed.`);
  }
  return { allowed: true, status: "allowed" };
}

function denied(status: "blocked" | "policy_denied", code: PlatformErrorCode, message: string): PolicyDecision {
  return { allowed: false, status, code, message };
}

function hostFromUrl(value: string): string | undefined {
  try {
    return new URL(value).host;
  } catch {
    return undefined;
  }
}

function pathMatches(pattern: string, path: string): boolean {
  if (pattern.endsWith("*")) {
    return path.startsWith(pattern.slice(0, -1));
  }
  return pattern === path;
}
