import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  credentialTypeSchema,
  pluginManifestSchema,
  type Credential,
  type Plugin,
  type PluginTool
} from "@mcphub/core";
import { z } from "zod";
import { pluginRecordFromManifest, pluginToolsFromManifest } from "./registry.js";
import type { PluginManifest } from "./sdk.js";

export const MCPHUB_PLUGIN_DIR_ENV = "MCPHUB_PLUGIN_DIR";

export const localPluginDangerousModeSchema = z.enum(["block", "auditOnly", "allow"]);

export const localPluginCredentialBindingSchema = z.object({
  type: credentialTypeSchema,
  secretRef: z.string().min(1),
  scope: z.string().min(1).optional()
});

export const localPluginPolicySchema = z.object({
  dangerousMode: localPluginDangerousModeSchema.default("auditOnly")
});

export const localPluginConfigSchema = z.object({
  enabled: z.boolean(),
  config: z.record(z.unknown()).default({}),
  credentials: z.record(localPluginCredentialBindingSchema).default({}),
  policy: localPluginPolicySchema.default({ dangerousMode: "auditOnly" })
});

export type LocalPluginDangerousMode = z.infer<typeof localPluginDangerousModeSchema>;
export type LocalPluginPolicyConfig = z.infer<typeof localPluginPolicySchema>;
export type LocalPluginConfigInput = z.input<typeof localPluginConfigSchema>;
export type LocalPluginConfig = z.infer<typeof localPluginConfigSchema>;

export type LocalPluginDiagnosticCode =
  | "plugin_dir_missing"
  | "plugin_dir_read_error"
  | "missing_entrypoint"
  | "entrypoint_stat_error"
  | "missing_config"
  | "config_read_error"
  | "config_parse_error"
  | "config_validation_error"
  | "manifest_import_error"
  | "manifest_validation_error"
  | "credential_binding_missing"
  | "credential_binding_type_mismatch"
  | "credential_binding_unknown"
  | "duplicate_plugin_id"
  | "duplicate_tool_name"
  | "disabled_plugin"
  | "loaded_plugin";

export interface LocalPluginDiagnostic {
  code: LocalPluginDiagnosticCode;
  severity: "info" | "warning" | "error";
  message: string;
  pluginDir?: string;
  pluginId?: string;
  toolName?: string;
  entryPath?: string;
  configPath?: string;
  details?: Record<string, unknown>;
}

export interface LocalPluginSeedData {
  plugins: Plugin[];
  pluginTools: PluginTool[];
  credentials: Credential[];
}

export interface LocalPluginLoadResult {
  manifests: PluginManifest[];
  policies: Record<string, LocalPluginPolicyConfig>;
  diagnostics: LocalPluginDiagnostic[];
  seed: LocalPluginSeedData;
}

export interface LoadLocalPluginsOptions {
  pluginDir?: string;
  existingManifests?: PluginManifest[];
}

export async function loadLocalPlugins(options: LoadLocalPluginsOptions = {}): Promise<LocalPluginLoadResult> {
  const pluginDir = options.pluginDir ?? process.env[MCPHUB_PLUGIN_DIR_ENV];
  const result = createEmptyLoadResult();
  if (!pluginDir) {
    return result;
  }

  const sortedPluginDirs = await listPluginDirectories(pluginDir, result.diagnostics);
  if (!sortedPluginDirs) {
    return result;
  }

  const seenPluginIds = new Set((options.existingManifests ?? []).map((manifest) => manifest.id));
  const seenToolNames = new Set((options.existingManifests ?? []).flatMap((manifest) => manifest.tools.map((tool) => tool.name)));

  for (const dirName of sortedPluginDirs) {
    const pluginPath = path.join(pluginDir, dirName);
    const entryPath = path.join(pluginPath, "index.js");
    const configPath = path.join(pluginPath, "plugin.config.json");

    const entryStats = await statPath(entryPath);
    if (!entryStats.ok) {
      const isMissing = isNotFoundError(entryStats.error);
      result.diagnostics.push({
        code: isMissing ? "missing_entrypoint" : "entrypoint_stat_error",
        severity: isMissing ? "warning" : "error",
        message: isMissing ? `Local plugin ${dirName} is missing index.js.` : `Could not inspect local plugin entrypoint ${entryPath}.`,
        pluginDir: pluginPath,
        entryPath,
        details: errorDetails(entryStats.error)
      });
      continue;
    }
    if (!entryStats.stats.isFile()) {
      result.diagnostics.push({
        code: "missing_entrypoint",
        severity: "warning",
        message: `Local plugin ${dirName} entrypoint is not a file.`,
        pluginDir: pluginPath,
        entryPath
      });
      continue;
    }

    const parsedConfig = await loadPluginConfig(configPath, pluginPath, result.diagnostics);
    if (!parsedConfig) {
      continue;
    }

    if (!parsedConfig.enabled) {
      result.diagnostics.push({
        code: "disabled_plugin",
        severity: "info",
        message: `Local plugin ${dirName} is disabled in plugin.config.json.`,
        pluginDir: pluginPath,
        entryPath,
        configPath
      });
      continue;
    }

    const manifest = await loadPluginManifest(entryPath, Number(entryStats.stats.mtimeMs), pluginPath, result.diagnostics);
    if (!manifest) {
      continue;
    }

    const duplicateTool = manifest.tools.find((tool) => seenToolNames.has(tool.name));
    if (duplicateTool) {
      result.diagnostics.push({
        code: "duplicate_tool_name",
        severity: "warning",
        message: `Skipping local plugin ${manifest.id} because tool ${duplicateTool.name} is already loaded.`,
        pluginDir: pluginPath,
        pluginId: manifest.id,
        toolName: duplicateTool.name,
        entryPath,
        configPath
      });
      continue;
    }

    const credentialDiagnostics = validateCredentialBindings(manifest, parsedConfig, pluginPath, configPath);
    if (credentialDiagnostics.length > 0) {
      result.diagnostics.push(...credentialDiagnostics);
      continue;
    }

    if (seenPluginIds.has(manifest.id)) {
      result.diagnostics.push({
        code: "duplicate_plugin_id",
        severity: "warning",
        message: `Skipping local plugin ${manifest.id} because that plugin id is already loaded.`,
        pluginDir: pluginPath,
        pluginId: manifest.id,
        entryPath,
        configPath
      });
      continue;
    }

    seenPluginIds.add(manifest.id);
    for (const tool of manifest.tools) {
      seenToolNames.add(tool.name);
    }

    result.manifests.push(manifest);
    result.policies[manifest.id] = parsedConfig.policy;
    result.seed.plugins.push(pluginRecordFromLocalPlugin(manifest, parsedConfig));
    result.seed.pluginTools.push(...pluginToolsFromManifest(manifest));
    result.seed.credentials.push(...credentialsFromLocalPlugin(manifest, parsedConfig));
    result.diagnostics.push({
      code: "loaded_plugin",
      severity: "info",
      message: `Loaded local plugin ${manifest.id}.`,
      pluginDir: pluginPath,
      pluginId: manifest.id,
      entryPath,
      configPath
    });
  }

  return result;
}

function createEmptyLoadResult(): LocalPluginLoadResult {
  return {
    manifests: [],
    policies: {},
    diagnostics: [],
    seed: {
      plugins: [],
      pluginTools: [],
      credentials: []
    }
  };
}

async function listPluginDirectories(pluginDir: string, diagnostics: LocalPluginDiagnostic[]): Promise<string[] | undefined> {
  const pluginDirStats = await statPath(pluginDir);
  if (!pluginDirStats.ok) {
    diagnostics.push({
      code: "plugin_dir_missing",
      severity: "warning",
      message: `Local plugin directory ${pluginDir} is unavailable.`,
      pluginDir,
      details: errorDetails(pluginDirStats.error)
    });
    return undefined;
  }
  if (!pluginDirStats.stats.isDirectory()) {
    diagnostics.push({
      code: "plugin_dir_missing",
      severity: "warning",
      message: `Local plugin directory ${pluginDir} is not a directory.`,
      pluginDir
    });
    return undefined;
  }

  try {
    const entries = await readdir(pluginDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    diagnostics.push({
      code: "plugin_dir_read_error",
      severity: "error",
      message: `Could not read local plugin directory ${pluginDir}.`,
      pluginDir,
      details: errorDetails(error)
    });
    return undefined;
  }
}

async function loadPluginConfig(
  configPath: string,
  pluginDir: string,
  diagnostics: LocalPluginDiagnostic[]
): Promise<LocalPluginConfig | undefined> {
  let rawConfig: string;
  try {
    rawConfig = await readFile(configPath, "utf8");
  } catch (error) {
    const isMissing = isNotFoundError(error);
    diagnostics.push({
      code: isMissing ? "missing_config" : "config_read_error",
      severity: isMissing ? "warning" : "error",
      message: isMissing ? `Local plugin directory ${pluginDir} is missing plugin.config.json.` : `Could not read ${configPath}.`,
      pluginDir,
      configPath,
      details: errorDetails(error)
    });
    return undefined;
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawConfig);
  } catch (error) {
    diagnostics.push({
      code: "config_parse_error",
      severity: "error",
      message: `Could not parse ${configPath} as JSON.`,
      pluginDir,
      configPath,
      details: errorDetails(error)
    });
    return undefined;
  }

  const parsedConfig = localPluginConfigSchema.safeParse(parsedJson);
  if (!parsedConfig.success) {
    diagnostics.push({
      code: "config_validation_error",
      severity: "error",
      message: `Local plugin config ${configPath} is invalid.`,
      pluginDir,
      configPath,
      details: { issues: parsedConfig.error.issues.map(formatZodIssue) }
    });
    return undefined;
  }

  return parsedConfig.data;
}

async function loadPluginManifest(
  entryPath: string,
  mtimeMs: number,
  pluginDir: string,
  diagnostics: LocalPluginDiagnostic[]
): Promise<PluginManifest | undefined> {
  let importedModule: unknown;
  try {
    const moduleUrl = new URL(`?mtime=${mtimeMs}`, pathToFileURL(entryPath).href);
    importedModule = await import(moduleUrl.href);
  } catch (error) {
    diagnostics.push({
      code: "manifest_import_error",
      severity: "error",
      message: `Failed to import local plugin module ${entryPath}.`,
      pluginDir,
      entryPath,
      details: errorDetails(error)
    });
    return undefined;
  }

  const parsedManifest = pluginManifestSchema.safeParse((importedModule as { default?: unknown }).default);
  if (!parsedManifest.success) {
    diagnostics.push({
      code: "manifest_validation_error",
      severity: "error",
      message: `Local plugin manifest ${entryPath} is invalid.`,
      pluginDir,
      entryPath,
      details: { issues: parsedManifest.error.issues.map(formatZodIssue) }
    });
    return undefined;
  }

  return parsedManifest.data;
}

function validateCredentialBindings(
  manifest: PluginManifest,
  config: LocalPluginConfig,
  pluginDir: string,
  configPath: string
): LocalPluginDiagnostic[] {
  const diagnostics: LocalPluginDiagnostic[] = [];
  const requirementById = new Map(manifest.credentials.map((credential) => [credential.id, credential] as const));

  for (const requirement of manifest.credentials) {
    const binding = config.credentials[requirement.id];
    if (!binding) {
      diagnostics.push({
        code: "credential_binding_missing",
        severity: "error",
        message: `Local plugin ${manifest.id} is missing a credential binding for ${requirement.id}.`,
        pluginDir,
        pluginId: manifest.id,
        configPath
      });
      continue;
    }
    if (binding.type !== requirement.type) {
      diagnostics.push({
        code: "credential_binding_type_mismatch",
        severity: "error",
        message: `Local plugin ${manifest.id} binds ${requirement.id} as ${binding.type}, expected ${requirement.type}.`,
        pluginDir,
        pluginId: manifest.id,
        configPath,
        details: {
          requirementId: requirement.id,
          expectedType: requirement.type,
          actualType: binding.type
        }
      });
    }
  }

  for (const requirementId of Object.keys(config.credentials)) {
    if (!requirementById.has(requirementId)) {
      diagnostics.push({
        code: "credential_binding_unknown",
        severity: "error",
        message: `Local plugin ${manifest.id} provides an unknown credential binding ${requirementId}.`,
        pluginDir,
        pluginId: manifest.id,
        configPath,
        details: { requirementId }
      });
    }
  }

  return diagnostics;
}

function pluginRecordFromLocalPlugin(manifest: PluginManifest, config: LocalPluginConfig): Plugin {
  return {
    ...pluginRecordFromManifest(manifest),
    config: config.config
  };
}

function credentialsFromLocalPlugin(manifest: PluginManifest, config: LocalPluginConfig): Credential[] {
  return manifest.credentials.flatMap((requirement) => {
    const binding = config.credentials[requirement.id];
    if (!binding) {
      return [];
    }
    return {
      id: `${manifest.id}.${requirement.id}`,
      pluginId: manifest.id,
      requirementId: requirement.id,
      name: requirement.id,
      type: binding.type,
      secretRef: binding.secretRef,
      scope: binding.scope
    };
  });
}

async function statPath(targetPath: string): Promise<{ ok: true; stats: Awaited<ReturnType<typeof stat>> } | { ok: false; error: unknown }> {
  try {
    return { ok: true, stats: await stat(targetPath) };
  } catch (error) {
    return { ok: false, error };
  }
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

function errorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message
    };
  }
  return { error: String(error) };
}

function formatZodIssue(issue: z.ZodIssue): Record<string, unknown> {
  return {
    path: issue.path.join("."),
    message: issue.message,
    code: issue.code
  };
}
